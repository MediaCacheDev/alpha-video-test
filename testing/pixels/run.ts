/**
 * Layer 2 pixel tests: shows frames of each fixture in the demo's pixel-test screen on a device,
 * captures each over black and over white, and measures it with the probe.
 *
 *   npm run test:pixels -- --platform android|ios [--only <regex>] [--frames 0,1,29,30,31,37,59]
 *                          [--playback] [--codecs vpx,av1] [--cards testing/build/testcard]
 *                          [--out testing/build/pixels/<platform>]
 *
 * `--only` matches "<card>/<fixture> <player> <mode>[ <decoder>][ <memoryStrategy>]", e.g. `--only "383x217/yuva.webm cpp"`.
 * `--playback` plays and loops each case instead, and checks the frame codes keep moving and wrap.
 * `--codecs` is the build's `"react-native-alpha-video": { "codecs" }` (none: `--codecs ''`). A case
 * the C++ core would decode without its codec must report NO_DECODER, naming the module.
 * Needs the demo's release build installed and the emulator or simulator booted, and the cards
 * generated (npm run testcards). Writes report.json and report.html; exits 1 if any case fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { Layout } from '../testcard/layout.ts';
import { probe, type PatchResult, type ProbeReport } from '../probe/probe.ts';
import { isDualStream, streamCodec, streamPixelFormat } from '../probe/decoders.ts';
import { failures, tolerancesFor, type Measured, type Tolerances } from '../probe/tolerances.ts';
import { run } from '../lib/run.ts';
import { connect, type Device, type Screenshot } from './device.ts';
import { crop, findLayout, meanLuma, unblend } from './capture.ts';
import { cardSize, framePng, pixelTestUrl, type Background, type Player, type ScreenLayout } from './screen.ts';
import { writeHtmlReport } from './report.ts';
import { knownIssueFor } from './known.ts';

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { values: args } = parseArgs({
  options: {
    platform: { type: 'string' },
    only: { type: 'string' },
    frames: { type: 'string', default: '0,1,29,30,31,37,59' },
    playback: { type: 'boolean', default: false },
    codecs: { type: 'string', default: 'vpx,av1' },
    cards: { type: 'string', default: path.join(demoRoot, 'testing/build/testcard') },
    out: { type: 'string' },
  },
});
if (!args.platform) throw new Error('--platform android|ios is required');
const outDir = path.resolve(args.out ?? path.join(demoRoot, 'testing/build/pixels', args.platform));
const frames = args.frames!.split(',').map(Number);
const codecs = args.codecs!.split(',').filter(Boolean);

/** Time for a player to load and show its first frame; the 1080p preloads decode every frame first. */
const LOAD_TIMEOUT_MS = 30_000;
const SEEK_TIMEOUT_MS = 5_000;
/**
 * Added to the decoded-frame tolerances: the compositor rounds each capture, and alpha comes
 * from the difference of two of them.
 */
const CAPTURE_LEVELS = 2;
/** How long a playback case watches; the 2 s cards loop twice in it. */
const PLAYBACK_MS = 5_000;
/** A screenshot takes about 0.3 s, so a frame code seen for longer than this means playback stopped. */
const MAX_STALL_MS = 1_000;

export interface Case {
  card: string;
  fixture: string;
  player: Player;
  /** Absent: the player's default (stream, for every player). */
  mode?: string;
  /** The C++ player's `decoder`; absent: 'auto'. */
  decoder?: string;
  /** The GPU player's `memoryStrategy`; absent: 'vram'. */
  memoryStrategy?: string;
  play?: boolean;
  /** The codec module the C++ core needs for this case and the build lacks: the case expects NO_DECODER. */
  missingCodec?: string;
}

export interface FrameResult {
  /** -1 for a playback case. */
  frame: number;
  /** Playback cases: the frame code in each screenshot. */
  seenCodes?: (number | null)[];
  /** From opening the link until the frame showed in two screenshots in a row. */
  waitMs: number;
  /** Empty when the frame never showed (see `error`). */
  failures: string[];
  /** The control <Image> against the card: anything here means the capture is wrong, not the player. */
  controlFailures: string[];
  error?: string;
  player?: Measured['worst'] & { frameCode: number | null; alphaCode: number };
  /** PNGs relative to the report: the player over black and white, and the full screen on errors. */
  images: string[];
}

export interface CaseResult extends Case {
  id: string;
  frames: FrameResult[];
  pass: boolean;
  /** From known.ts. */
  knownIssue?: string;
  /** 'known': failed and listed in known.ts. 'unexpected pass': listed, but passed. */
  status: 'pass' | 'fail' | 'known' | 'unexpected pass';
}

const label = (c: Case) =>
  `${c.card}/${c.fixture} ${c.player} ${c.mode ?? 'default'}${c.decoder ? ` ${c.decoder}` : ''}` +
  `${c.memoryStrategy ? ` ${c.memoryStrategy}` : ''}${c.play ? ' play' : ''}`;

function casesFor(card: string, fixture: string, file: string, platform: string): Case[] {
  if (/\.ktx2$/.test(fixture)) {
    const gpu = (mode?: string, memoryStrategy?: string): Case =>
      ({ card, fixture, player: 'gpu', mode, memoryStrategy, play: args.playback });
    return [gpu(), gpu('stream', 'ram'), gpu('preload')];
  }
  const av1 = streamCodec(file, 0) === 'av1';
  // The demo's ffmpeg-kit build (ffmpegkit-vp9) decodes VP9 only
  const ffmpegKit = !isDualStream(file) && streamCodec(file, 0) === 'vp9';
  // Every WebM card has colour and alpha as separate bitstreams (a YUVA file's alpha is in
  // BlockAdditional), so Android's MediaCodec can take them, ignoring `mode`, except a gbrp alpha
  // track: no Android decoder lists VP9 profile 1.
  const mediaCodec = !isDualStream(file) || streamPixelFormat(file, 1) !== 'gbrp';
  const codec = av1 ? 'av1' : 'vpx';
  const as = (player: Player, mode?: string, decoder?: string, memoryStrategy?: string): Case => {
    const onCore = player === 'cpp' && (platform === 'ios' || decoder === 'software' || (!decoder && !mediaCodec));
    const missingCodec = onCore && !codecs.includes(codec) ? codec : undefined;
    return { card, fixture, player, mode, decoder, memoryStrategy, play: args.playback, missingCodec };
  };
  if (platform === 'android') {
    // Each engine runs besides 'auto'. The test devices have no AV1 hardware decoder.
    return [
      as('cpp'),
      as('cpp', undefined, 'software'),
      as('cpp', 'preload', 'software'),
      ...(mediaCodec && !av1 ? [as('cpp', undefined, 'mediacodec-hw')] : []),
      ...(mediaCodec ? [as('cpp', undefined, 'mediacodec-sw')] : []),
      ...(ffmpegKit ? [as('ffk-gpu'), as('ffk-gpu', 'preload'), as('ffk-cpu')] : []),
    ];
  }
  // Elsewhere the C++ core decodes dual-stream files: libvpx for VP8 and VP9, dav1d for AV1.
  const cpp = [as('cpp'), as('cpp', 'preload')];
  if (!ffmpegKit) return cpp;
  return [...cpp, as('ffk-gpu'), as('ffk-gpu', 'preload'), as('ffk-cpu')];
}

function allCases(platform: string): Case[] {
  const cases: Case[] = [];
  for (const card of fs.readdirSync(args.cards!).filter((d) => d.startsWith('card_')).sort()) {
    const fixtures: string[] = JSON.parse(fs.readFileSync(path.join(args.cards!, card, 'fixtures.json'), 'utf8'));
    for (const fixture of fixtures) cases.push(...casesFor(card, fixture, path.join(args.cards!, card, fixture), platform));
  }
  const only = args.only ? new RegExp(args.only) : null;
  return cases.filter((c) => !only || only.test(label(c)));
}

function measured(r: ProbeReport, frame: number): Measured {
  const worst = (patches: PatchResult[]) => Math.max(...patches.map((p) => p.maxError));
  const orFail = (v: number) => (Number.isNaN(v) ? Infinity : v);
  return {
    frames: 1,
    frameCodeOk: r.frameCode === frame ? 1 : 0,
    alphaCodeOk: r.alphaCode === frame ? 1 : 0,
    worst: {
      corners: worst(r.corners),
      alphaRamp: worst(r.alphaRamp),
      colours: worst(r.colours),
      edgeColourVsAlphaPx: orFail(r.edge.colourVsAlphaPx),
      edgePositionPx: orFail(r.edge.positionErrorPx),
      shearPx: orFail(r.shearPx),
      movingBlockPx: orFail(r.movingBlockErrorPx),
    },
  };
}

function writePng(image: { width: number; height: number; data: Uint8Array }, file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${image.width}x${image.height}`, '-i', '-', file],
    { input: image.data });
}

interface Shown {
  shot: Screenshot | null;
  layout: ScreenLayout | null;
  ms: number;
  ok: boolean;
  /** What the last screenshot showed, for the error message. */
  seen: string;
}

/** Takes screenshots until the player and the control show the frame over the background in `times` screenshots in a row. */
function waitForFrame(device: Device, card: Layout, frame: number, bg: Background, times: number, timeoutMs: number): Shown {
  const start = Date.now();
  let inARow = 0;
  let last: Shown = { shot: null, layout: null, ms: 0, ok: false, seen: 'no screenshot' };
  while (Date.now() - start < timeoutMs) {
    const shot = device.screenshot();
    const layout = findLayout(shot, card);
    let seen = 'not the test screen';
    if (layout) {
      const luma = meanLuma(shot, layout.background);
      const code = probe(crop(shot, layout.player), card).frameCode;
      const controlCode = probe(crop(shot, layout.control), card).frameCode;
      seen = `background luma ${luma.toFixed(0)}, frame code ${code}, control ${controlCode}`;
      const ok = code === frame && controlCode === frame && (bg === 'black' ? luma < 16 : luma > 239);
      inARow = ok ? inARow + 1 : 0;
    }
    last = { shot, layout, ms: Date.now() - start, ok: inARow >= times, seen };
    if (last.ok) return last;
  }
  return last;
}

/** Whether frame code `b` can follow `a` during playback: the same, later, or wrapped to the start. */
function follows(a: number, b: number, frameCount: number): boolean {
  const ahead = (b - a + frameCount) % frameCount;
  return ahead < frameCount / 2;
}

/**
 * Plays the clip looping, and checks from screenshots that the frame codes keep moving forward and wrap.
 * `bg` should differ from the previous case's, which tells this case's screen from the last one.
 */
function watchPlayback(device: Device, c: Case, card: Layout, id: string, bg: Background): FrameResult {
  const result: FrameResult = { frame: -1, waitMs: 0, failures: [], controlFailures: [], images: [], seenCodes: [] };
  device.open(pixelTestUrl({ ...c, root: device.root, frame: 0, bg }));
  const start = Date.now();
  let shot: Screenshot | null = null;
  const codes = result.seenCodes!;
  const times: number[] = [];
  while (Date.now() - start < LOAD_TIMEOUT_MS + PLAYBACK_MS) {
    shot = device.screenshot();
    const layout = findLayout(shot, card);
    const luma = layout ? meanLuma(shot, layout.background) : NaN;
    const onThisScreen = bg === 'black' ? luma < 16 : luma > 239;
    const code = layout && onThisScreen ? probe(crop(shot, layout.player), card).frameCode : null;
    if (codes.length === 0 && code === null) continue;
    if (codes.length === 0) result.waitMs = Date.now() - start;
    codes.push(code);
    times.push(Date.now());
    if (times[times.length - 1] - times[0] > PLAYBACK_MS) break;
  }
  if (codes.length === 0) {
    result.error = `no frame showed in ${LOAD_TIMEOUT_MS / 1000} s`;
  } else {
    const problems = new Set<string>();
    let wraps = 0;
    let stuckSince = 0;
    let longestStall = { ms: 0, frame: -1 };
    for (let i = 1; i < codes.length; i++) {
      const [a, b] = [codes[i - 1], codes[i]];
      if (b === null) problems.add('screenshots without a frame code');
      if (a === null || b === null) continue;
      if (!follows(a, b, card.frames)) problems.add(`went back from frame ${a} to ${b}`);
      else if (b < a) wraps++;
      if (b !== a) stuckSince = i;
      const stalled = times[i] - times[stuckSince];
      if (stalled > longestStall.ms) longestStall = { ms: stalled, frame: b };
    }
    if (longestStall.ms > MAX_STALL_MS) problems.add(`stuck on frame ${longestStall.frame} for ${(longestStall.ms / 1000).toFixed(1)} s`);
    if (wraps === 0) problems.add(`never looped in ${PLAYBACK_MS / 1000} s`);
    result.failures = [...problems];
  }
  if ((result.error || result.failures.length > 0) && shot) {
    const name = `img/${id}_playback_screen.png`;
    writePng(shot, path.join(outDir, name));
    result.images.push(name);
  }
  return result;
}

/** Opens the case and waits for the player's NO_DECODER error naming the missing module. */
function expectNoDecoder(device: Device, c: Case, bg: Background): FrameResult {
  const result: FrameResult = { frame: -1, waitMs: 0, failures: [], controlFailures: [], images: [] };
  device.consoleLog();
  device.open(pixelTestUrl({ ...c, root: device.root, frame: 0, bg }));
  const expected = `(the ${c.missingCodec} codec module)`;
  const start = Date.now();
  let errors: string[] = [];
  while (Date.now() - start < LOAD_TIMEOUT_MS) {
    errors.push(...device.consoleLog().split('\n').filter((line) => line.includes('pixeltest error')));
    if (errors.length > 0) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  result.waitMs = Date.now() - start;
  if (errors.length === 0) result.error = `no error in ${LOAD_TIMEOUT_MS / 1000} s, expected NO_DECODER ${expected}`;
  else if (!errors.some((e) => e.includes('pixeltest error NO_DECODER:') && e.includes(expected))) {
    result.failures.push(`expected NO_DECODER ${expected}, got: ${errors.join(' | ')}`);
  }
  return result;
}

function runCase(device: Device, c: Case, caseIndex: number): CaseResult {
  const id = `${c.card}_${c.fixture}_${c.player}${c.mode ? `_${c.mode}` : ''}${c.decoder ? `_${c.decoder}` : ''}${c.memoryStrategy ? `_${c.memoryStrategy}` : ''}${c.play ? '_play' : ''}`
    .replace(/[^\w.-]+/g, '_');
  const cardDir = path.join(args.cards!, c.card);
  const card: Layout = JSON.parse(fs.readFileSync(path.join(cardDir, 'layout.json'), 'utf8'));
  for (const rel of [c.fixture, ...frames.map(framePng)]) device.push(path.join(cardDir, rel), `${c.card}/${rel}`);

  const base = tolerancesFor(c.fixture);
  const results: FrameResult[] = [];
  const bg: Background = caseIndex % 2 === 0 ? 'black' : 'white';
  if (c.missingCodec) results.push(expectNoDecoder(device, c, bg));
  else if (c.play) results.push(watchPlayback(device, c, card, id, bg));
  for (const [i, frame] of (c.play || c.missingCodec ? [] : frames).entries()) {
    // Alternate the order so each frame changes the background once, not twice.
    const order: Background[] = i % 2 === 0 ? ['black', 'white'] : ['white', 'black'];
    const shots: Partial<Record<Background, Shown>> = {};
    const result: FrameResult = { frame, waitMs: 0, failures: [], controlFailures: [], images: [] };
    results.push(result);
    for (const [j, bg] of order.entries()) {
      device.open(pixelTestUrl({ ...c, root: device.root, frame, bg }));
      const timeout = i === 0 && j === 0 ? LOAD_TIMEOUT_MS : SEEK_TIMEOUT_MS;
      const shown = waitForFrame(device, card, frame, bg, j === 0 ? 2 : 1, timeout);
      if (j === 0) result.waitMs = shown.ms;
      if (!shown.ok) {
        result.error = `frame ${frame} over ${bg} didn't show in ${timeout / 1000} s (${shown.seen})`;
        if (shown.shot) {
          const name = `img/${id}_f${frame}_screen.png`;
          writePng(shown.shot, path.join(outDir, name));
          result.images.push(name);
        }
        break;
      }
      shots[bg] = shown;
    }
    if (result.error) break;

    const black = shots.black!, white = shots.white!;
    const layout = black.layout!;
    const scale = layout.player.w / card.width;
    const loosen = (t: Tolerances): Tolerances => ({ levels: t.levels + CAPTURE_LEVELS, positionPx: t.positionPx / Math.min(1, scale) });
    const player = probe(unblend(black.shot!, white.shot!, layout.player), card, frame);
    const control = probe(unblend(black.shot!, white.shot!, layout.control), card, frame);
    const m = measured(player, frame);
    result.failures = failures(m, loosen(base));
    result.controlFailures = failures(measured(control, frame), loosen({ levels: 0, positionPx: 1 }));
    result.player = { ...m.worst, frameCode: player.frameCode, alphaCode: player.alphaCode };
    if (i === 0 || result.failures.length > 0 || result.controlFailures.length > 0) {
      for (const bg of ['black', 'white'] as const) {
        const name = `img/${id}_f${frame}_${bg}.png`;
        writePng(crop(shots[bg]!.shot!, layout.player), path.join(outDir, name));
        result.images.push(name);
      }
    }
  }
  const pass = results.length === (c.play || c.missingCodec ? 1 : frames.length) &&
    results.every((r) => !r.error && r.failures.length === 0);
  const knownIssue = c.missingCodec ? undefined : knownIssueFor(`${device.platform} ${label(c)}`, device.emulator);
  const status = knownIssue ? (pass ? 'unexpected pass' : 'known') : pass ? 'pass' : 'fail';
  const name = (r: FrameResult) => (c.missingCodec ? 'NO_DECODER' : r.frame < 0 ? 'playback' : r.frame);
  const line = results.map((r) => (r.error ? `${name(r)}:ERR` : r.failures.length ? `${name(r)}:FAIL` : `${name(r)}:ok`)).join(' ');
  console.log(`${String(caseIndex + 1).padStart(3)} ${status.toUpperCase().padEnd(15)} ${label(c)}  ${line}`);
  if (knownIssue) console.log(`        known: ${knownIssue}`);
  // The same problem on several frames prints once, with the frames.
  const problems = new Map<string, number[]>();
  for (const r of results) {
    for (const p of [...r.failures, ...r.controlFailures.map((f) => `control: ${f}`)]) problems.set(p, [...(problems.get(p) ?? []), r.frame]);
  }
  for (const [p, onFrames] of problems) console.log(`        ${c.play ? 'playback' : `frame ${onFrames.join(', ')}`}: ${p}`);
  for (const r of results) if (r.seenCodes && !pass) console.log(`        codes seen: ${r.seenCodes.join(' ')}`);
  for (const r of results) if (r.error) console.log(`        ${r.error}`);
  return { ...c, id, frames: results, pass, knownIssue, status };
}

const device = connect(args.platform);
const cases = allCases(args.platform);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
console.log(`${cases.length} cases on ${args.platform}, frames ${frames.join(', ')}; report in ${path.relative(process.cwd(), outDir)}`);
const started = Date.now();
const results = cases.map((c, i) => runCase(device, c, i));
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 2));
writeHtmlReport(path.join(outDir, 'report.html'), args.platform, results);
const count = (status: CaseResult['status']) => results.filter((r) => r.status === status).length;
console.log(`\n${count('pass')}/${results.length} cases pass, ${count('known')} known issues, ${count('fail')} failures, ` +
  `${count('unexpected pass')} unexpected passes (remove them from known.ts), in ${((Date.now() - started) / 1000).toFixed(0)} s.`);
if (count('fail') + count('unexpected pass') > 0) process.exit(1);
