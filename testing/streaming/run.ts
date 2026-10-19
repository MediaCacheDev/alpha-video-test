/**
 * Range streaming tests for react-native-alpha-video and react-native-alpha-video-gpu on a device:
 * plays clips from local servers through the demo's stream-test screen and checks what it
 * requested.
 *
 *   npm run test:streaming -- --platform android|ios [--player cpp|gpu] [--only <regex>]
 *
 * Covers range requests and a seek (to the Cues for WebM, to a seek point for KTX2), a server
 * without range support, replay from the disk store (also after a restart) and the memory store
 * with no requests, `source.headers`, and an app data source (Media3 on Android, a URLSession one
 * in AppDelegate.swift on iOS). `--player cpp` keeps the WebM cases (react-native-alpha-video),
 * `--player gpu` the KTX2 ones (react-native-alpha-video-gpu, named "ktx2 …"). Needs the demo's
 * release build installed and the emulator or simulator booted. Exits 1 if any case fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { run } from '../lib/run.ts';
import { connect, type Device } from '../pixels/device.ts';
import { streamTestUrl, type StreamTestCase } from './link.ts';

interface RangeServer {
  port: number;
  url: string;
  requests: { path: string; range: string | null; headers: Record<string, string | undefined> }[];
  setFile(path: string, buffer: Buffer): void;
  close(): Promise<void>;
}
type StartRangeServer = (options: Record<string, unknown>) => Promise<RangeServer>;

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { values: args } = parseArgs({
  options: { platform: { type: 'string' }, player: { type: 'string' }, only: { type: 'string' } },
});
if (!args.platform) throw new Error('--platform android|ios is required');
if (args.player && !['cpp', 'gpu'].includes(args.player)) throw new Error('--player is cpp or gpu');
const only = args.only ? new RegExp(args.only) : null;

const LOAD_TIMEOUT_MS = 20_000;
/** A 10 s clip played once, plus its load. */
const END_TIMEOUT_MS = 30_000;
/** Time after a seek for its requests, and for a failure to show. */
const SEEK_SETTLE_MS = 4_000;

const build = path.join(demoRoot, 'testing/build/streaming');

interface Clip {
  data: Buffer;
  ext: 'webm' | 'ktx2';
  /** Seconds a seek case seeks to */
  seekTo: number;
  /** Where the seek's request starts, as fractions of the file */
  seekRange: [number, number];
}
const webm = (data: Buffer): Clip => ({ data, ext: 'webm', seekTo: 9, seekRange: [0.5, 1] });
// The seek table's read at load starts in the last 1%
const ktx2 = (data: Buffer): Clip => ({ data, ext: 'ktx2', seekTo: 5, seekRange: [0.5, 0.98] });
const media = (name: string) => fs.readFileSync(path.join(demoRoot, 'assets/media', name));
const clips = {
  dual: webm(makeClip('dual.webm', true)),
  yuva: webm(makeClip('yuva.webm', false)),
  ktx2Seek: ktx2(makeKtx2Clip()),
  // 6 s, zstd as one stream (no seek table), and 3 s uncompressed: both read whole or in order
  ktx2Stream: { ...ktx2(media('test_stream.ktx2')), seekTo: 3 },
  ktx2Uncompressed: { ...ktx2(media('seek_uncompressed.ktx2')), seekTo: 2 },
};

/** A 10 s 480x270 clip, noisy so it doesn't compress to nothing, a keyframe a second; Cues at the end. */
function makeClip(name: string, dualStream: boolean): Buffer {
  const file = path.join(build, name);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(build, { recursive: true });
    const inputs = [
      '-f', 'lavfi', '-i', 'testsrc2=s=480x270:r=30:d=10,noise=alls=12:allf=t',
      '-f', 'lavfi', '-i', 'gradients=s=480x270:r=30:d=10',
    ];
    const streams = dualStream
      ? ['-filter_complex', '[0:v]format=yuv420p[c];[1:v]format=gray,format=yuv420p[a]', '-map', '[c]', '-map', '[a]', '-metadata:s:v:1', 'title=Alpha']
      : ['-filter_complex', '[0:v]format=yuv420p[c];[1:v]format=gray[a];[c][a]alphamerge,format=yuva420p[v]', '-map', '[v]', '-pix_fmt', 'yuva420p'];
    run('ffmpeg', [
      '-v', 'error', '-y', ...inputs, ...streams,
      '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-g', '30', '-keyint_min', '30', '-auto-alt-ref', '0',
      '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', file,
    ]);
  }
  return fs.readFileSync(file);
}

/** A 6 s 384x216 KTX2 clip, noisy, zstd with a seek point every 1 MB of ASTC (15 of them). */
function makeKtx2Clip(): Buffer {
  const file = path.join(build, 'seek.ktx2');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(build, { recursive: true });
    const video = path.join(build, 'ktx2-source.mov');
    run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=384x216:r=30:d=6,noise=alls=12:allf=t,format=rgba', '-c:v', 'png', video]);
    const texenc = path.resolve(demoRoot, '../alpha-video-gpu-encoder/texenc.js');
    run(process.execPath, [texenc, '-v', video, '--frame-count', '180', '-o', file, '--astc-quality', 'fastest', '--zstd', '3', '--seek-interval', '1', '-y']);
  }
  return fs.readFileSync(file);
}

/** Collects the screen's events: GET /event?id=…&event=…&detail=… */
async function startReportServer() {
  const events: { id: string; event: string; detail: string }[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/event') {
      events.push({ id: url.searchParams.get('id') ?? '', event: url.searchParams.get('event') ?? '', detail: url.searchParams.get('detail') ?? '' });
    }
    res.writeHead(204).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return { port, url: `http://127.0.0.1:${port}`, events, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const rangeStart = (range: string | null) => (range ? Number(/^bytes=(\d+)-/.exec(range)?.[1] ?? NaN) : 0);

const serverModule = path.resolve(demoRoot, '../alpha-video-source/web/test/range-server.mjs');
const { startRangeServer } = (await import(serverModule)) as { startRangeServer: StartRangeServer };
const ranged = await startRangeServer({ range: true });
const unranged = await startRangeServer({ range: false });
const guarded = await startRangeServer({ range: true, requireHeader: ['X-Token', 'secret'] });
const reports = await startReportServer();
const servers = [ranged, unranged, guarded];

const device: Device = connect(args.platform);
if (device.platform === 'android') {
  const adb = path.join(process.env.ANDROID_HOME ?? path.join(process.env.HOME ?? '', 'Library/Android/sdk'), 'platform-tools/adb');
  for (const port of [...servers.map((s) => s.port), reports.port]) run(adb, ['reverse', `tcp:${port}`, `tcp:${port}`]);
}
const dataSource = device.platform === 'android'
  ? { name: 'media3', userAgent: 'AlphaVideoTest-Media3' }
  : { name: 'test', userAgent: 'AlphaVideoTest-DataSource' };

const runId = Date.now().toString(36);
let caseCount = 0;

type Props = Omit<StreamTestCase, 'id' | 'uri' | 'report' | 'player'>;

/** Serves a clip on `server` under a path of its own, so each case's requests can be told apart. */
function serveClip(server: RangeServer, clip: Clip): string {
  const clipPath = `/${runId}-${++caseCount}.${clip.ext}`;
  server.setFile(clipPath, clip.data);
  return clipPath;
}

/** Opens a case on the screen; returns what it reported and what was requested for its clip. */
function open(server: RangeServer, clipPath: string, props: Props) {
  const [name, ext] = clipPath.slice(1).split('.');
  const id = `${name}-${Math.random().toString(36).slice(2, 6)}`;
  const player = ext === 'ktx2' ? 'ktx2' : 'webm';
  device.open(streamTestUrl({ ...props, player, id, uri: `${server.url}${clipPath}`, report: reports.url }));
  const events = () => reports.events.filter((e) => e.id === id);
  return {
    events,
    requests: () => server.requests.filter((r) => r.path === clipPath),
    async waitFor(event: string, timeoutMs: number) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const found = events().find((e) => e.event === event);
        if (found) return found;
        const error = events().find((e) => e.event === 'error');
        if (error) throw new Error(`error before ${event}: ${error.detail}`);
        if (Date.now() > deadline) throw new Error(`no ${event} in ${timeoutMs} ms (events: ${events().map((e) => e.event).join(', ') || 'none'})`);
        await sleep(100);
      }
    },
    assertNoError() {
      const error = events().find((e) => e.event === 'error');
      if (error) throw new Error(`error: ${error.detail}`);
    },
  };
}

function describe(requests: { range: string | null }[], size: number): string {
  return requests.map((r) => (r.range ? `${Math.round((rangeStart(r.range) / size) * 100)}%` : 'no Range')).join(', ');
}

/**
 * Loads, seeks near the end, and checks a request jumped there: past the middle, to the Cues and
 * the cluster for WebM, to a seek point for KTX2.
 */
async function seekCase(server: RangeServer, clip: Clip, props: Props, expectJump: boolean) {
  const c = open(server, serveClip(server, clip), { ...props, storage: props.storage ?? 'none', seekTo: clip.seekTo });
  const load = await c.waitFor('load', LOAD_TIMEOUT_MS);
  await c.waitFor('seek', 5_000);
  await sleep(SEEK_SETTLE_MS);
  c.assertNoError();
  const requests = c.requests();
  const size = clip.data.length;
  if (requests.length === 0) throw new Error('no requests');
  const [from, to] = clip.seekRange;
  if (expectJump && !requests.some((r) => rangeStart(r.range) > size * from && rangeStart(r.range) < size * to)) {
    throw new Error(`no request from ${from * 100}% to ${to * 100}%: ${describe(requests, size)}`);
  }
  return { load, requests, detail: `${load.detail}; ${requests.length} requests at ${describe(requests, size)}` };
}

/** Plays a clip through once, then again (after restarting the app): the second play must make no requests. */
async function replayCase(clip: Clip, storage: 'disk' | 'memory', restart = false) {
  const clipPath = serveClip(ranged, clip);
  const first = open(ranged, clipPath, { storage, loop: false });
  await first.waitFor('end', END_TIMEOUT_MS);
  const firstCount = first.requests().length;
  if (restart) device.restart();
  const again = open(ranged, clipPath, { storage, loop: false, seekTo: clip.seekTo / 2 });
  await again.waitFor('load', LOAD_TIMEOUT_MS);
  await again.waitFor('seek', 5_000);
  await sleep(SEEK_SETTLE_MS);
  again.assertNoError();
  const extra = ranged.requests.filter((r) => r.path === clipPath).length - firstCount;
  if (extra !== 0) throw new Error(`the replay made ${extra} requests`);
  return `first play ${firstCount} requests, replay and seek 0`;
}

const cases: [string, () => Promise<string>][] = [
  ['ranges dual-stream', async () => (await seekCase(ranged, clips.dual, {}, true)).detail],
  ['ranges yuva', async () => (await seekCase(ranged, clips.yuva, {}, true)).detail],
  ['no ranges dual-stream', async () => {
    const { requests, detail } = await seekCase(unranged, clips.dual, {}, false);
    if (requests.some((r) => !r.range)) throw new Error('a request without Range');
    return detail;
  }],
  ['preload fetches once', async () => {
    const { requests, detail } = await seekCase(ranged, clips.dual, { mode: 'preload' }, false);
    if (requests.length !== 1) throw new Error(`${requests.length} requests, expected 1`);
    return detail;
  }],
  ['replay from disk', () => replayCase(clips.dual, 'disk')],
  ['replay from disk after a restart', () => replayCase(clips.dual, 'disk', true)],
  ['replay from memory', () => replayCase(clips.dual, 'memory')],
  ['headers sent', () => headersCase(clips.dual)],
  ['headers missing → onError', () => missingHeadersCase(clips.dual)],
  [`data source (${dataSource.name})`, () => dataSourceCase(clips.dual)],

  ['ktx2 ranges, seek table', async () => (await seekCase(ranged, clips.ktx2Seek, {}, true)).detail],
  ['ktx2 ranges, one zstd stream', async () => (await seekCase(ranged, clips.ktx2Stream, {}, false)).detail],
  ['ktx2 uncompressed, read whole', async () => (await seekCase(ranged, clips.ktx2Uncompressed, {}, false)).detail],
  ['ktx2 no ranges', async () => {
    const { requests, detail } = await seekCase(unranged, clips.ktx2Seek, {}, false);
    if (requests.some((r) => !r.range)) throw new Error('a request without Range');
    return detail;
  }],
  ['ktx2 replay from disk', () => replayCase(clips.ktx2Seek, 'disk')],
  ['ktx2 replay from disk after a restart', () => replayCase(clips.ktx2Seek, 'disk', true)],
  ['ktx2 replay from memory', () => replayCase(clips.ktx2Seek, 'memory')],
  ['ktx2 headers sent', () => headersCase(clips.ktx2Seek)],
  ['ktx2 headers missing → onError', () => missingHeadersCase(clips.ktx2Seek)],
  [`ktx2 data source (${dataSource.name})`, () => dataSourceCase(clips.ktx2Seek)],
];

async function headersCase(clip: Clip) {
  const { requests, detail } = await seekCase(guarded, clip, { headers: { 'X-Token': 'secret' } }, true);
  if (requests.some((r) => r.headers['x-token'] !== 'secret')) throw new Error('a request without the header');
  return detail;
}

async function missingHeadersCase(clip: Clip) {
  const c = open(guarded, serveClip(guarded, clip), { storage: 'none' });
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  while (!c.events().some((e) => e.event === 'error')) {
    if (c.events().some((e) => e.event === 'load')) throw new Error('loaded without the header');
    if (Date.now() > deadline) throw new Error('no error');
    await sleep(100);
  }
  return c.events().find((e) => e.event === 'error')!.detail;
}

async function dataSourceCase(clip: Clip) {
  const { requests, detail } = await seekCase(ranged, clip, { dataSource: dataSource.name, storage: 'auto' }, true);
  const agents = new Set(requests.map((r) => r.headers['user-agent']));
  if (agents.size !== 1 || !agents.has(dataSource.userAgent)) throw new Error(`user agents: ${[...agents].join(', ')}`);
  return detail;
}
if (device.platform === 'android') {
  cases.splice(2, 0,
    ['ranges dual-stream, C++ core', async () => (await seekCase(ranged, clips.dual, { decoder: 'software' }, true)).detail],
    ['ranges yuva, C++ core', async () => (await seekCase(ranged, clips.yuva, { decoder: 'software' }, true)).detail],
  );
}

let failed = 0;
for (const [name, test] of cases) {
  if (args.player && (name.startsWith('ktx2 ') ? 'gpu' : 'cpp') !== args.player) continue;
  if (only && !only.test(name)) continue;
  try {
    console.log(`✓ ${name}: ${await test()}`);
  } catch (error) {
    failed++;
    console.log(`✗ ${name}: ${(error as Error).message}`);
  }
}
await Promise.all([...servers.map((s) => s.close()), reports.close()]);
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
