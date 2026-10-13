/**
 * Layer 2 pixel tests: shows frames of each fixture in the demo's pixel-test screen on a device,
 * captures each over black and over white, and measures it with the probe.
 *
 *   npm run test:pixels -- --platform android|ios [--only <regex>] [--frames 0,1,29,30,31,37,59]
 *                          [--cards testing/build/testcard] [--out testing/build/pixels/<platform>]
 *
 * `--only` matches "<card>/<fixture> <player> <mode>", e.g. `--only "383x217/yuva.webm cpp"`.
 * Needs the demo's release build installed and the emulator or simulator booted, and the cards
 * generated (npm run testcards). Writes report.json and report.html; exits 1 if any case fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { Layout } from '../testcard/layout.ts';
import { probe, type PatchResult, type ProbeReport } from '../probe/probe.ts';
import { isDualStream, streamCodec } from '../probe/decoders.ts';
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
    cards: { type: 'string', default: path.join(demoRoot, 'testing/build/testcard') },
    out: { type: 'string' },
  },
});
if (!args.platform) throw new Error('--platform android|ios is required');
const outDir = path.resolve(args.out ?? path.join(demoRoot, 'testing/build/pixels', args.platform));
const frames = args.frames!.split(',').map(Number);

/** Time for a player to load and show its first frame; the 1080p preloads decode every frame first. */
const LOAD_TIMEOUT_MS = 30_000;
const SEEK_TIMEOUT_MS = 5_000;
/**
 * Added to the decoded-frame tolerances: the compositor rounds each capture, and alpha comes
 * from the difference of two of them.
 */
const CAPTURE_LEVELS = 2;

export interface Case {
  card: string;
  fixture: string;
  player: Player;
  /** Absent: the player's default (C++ preload, ffmpeg-kit stream, GPU player not streaming). */
  mode?: string;
}

export interface FrameResult {
  frame: number;
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

const label = (c: Case) => `${c.card}/${c.fixture} ${c.player} ${c.mode ?? 'default'}`;

function casesFor(card: string, fixture: string, file: string, platform: string): Case[] {
  const as = (player: Player, mode?: string): Case => ({ card, fixture, player, mode });
  if (/\.ktx2(\.zst)?$/.test(fixture)) return [as('gpu'), as('gpu', 'stream')];
  // The C++ core decodes VP9 only; AV1 plays through MediaCodec, on Android.
  const cpp = streamCodec(file, 0) === 'vp9' || platform === 'android' ? [as('cpp'), as('cpp', 'stream')] : [];
  if (isDualStream(file)) return cpp;
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

function runCase(device: Device, c: Case, caseIndex: number): CaseResult {
  const id = `${c.card}_${c.fixture}_${c.player}${c.mode ? `_${c.mode}` : ''}`.replace(/[^\w.-]+/g, '_');
  const cardDir = path.join(args.cards!, c.card);
  const card: Layout = JSON.parse(fs.readFileSync(path.join(cardDir, 'layout.json'), 'utf8'));
  for (const rel of [c.fixture, ...frames.map(framePng)]) device.push(path.join(cardDir, rel), `${c.card}/${rel}`);

  const base = tolerancesFor(c.fixture);
  const results: FrameResult[] = [];
  for (const [i, frame] of frames.entries()) {
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
  const pass = results.length === frames.length && results.every((r) => !r.error && r.failures.length === 0);
  const knownIssue = knownIssueFor(`${device.platform} ${label(c)}`);
  const status = knownIssue ? (pass ? 'unexpected pass' : 'known') : pass ? 'pass' : 'fail';
  const line = results.map((r) => (r.error ? `${r.frame}:ERR` : r.failures.length ? `${r.frame}:FAIL` : `${r.frame}:ok`)).join(' ');
  console.log(`${String(caseIndex + 1).padStart(3)} ${status.toUpperCase().padEnd(15)} ${label(c)}  ${line}`);
  if (knownIssue) console.log(`        known: ${knownIssue}`);
  // The same problem on several frames prints once, with the frames.
  const problems = new Map<string, number[]>();
  for (const r of results) {
    for (const p of [...r.failures, ...r.controlFailures.map((f) => `control: ${f}`)]) problems.set(p, [...(problems.get(p) ?? []), r.frame]);
  }
  for (const [p, onFrames] of problems) console.log(`        frame ${onFrames.join(', ')}: ${p}`);
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
