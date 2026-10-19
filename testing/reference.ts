/**
 * Runs the probe over every fixture with the reference decoders and the player models.
 *
 *   node testing/reference.ts [--cards testing/build/testcard]
 *
 * Prints one row per fixture and decoder with the worst error per feature over all frames,
 * and writes the full numbers to <cards>/reference.json. Fails (exit 1) if a reference decoder
 * misses the tolerances, which would mean the cards or the probe are wrong. The player models
 * only report: they reproduce the players' maths, known bugs included.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Layout } from './testcard/layout.ts';
import { probe, type PatchResult, type ProbeReport } from './probe/probe.ts';
import { cppModel, ffmpegKitGpuModel, referenceKTX2, referenceWebM, isDualStream, streamCodec, type Frames } from './probe/decoders.ts';
import { failures, tolerancesFor } from './probe/tolerances.ts';

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--cards');
const cardsRoot = path.resolve(i >= 0 ? process.argv[i + 1] : path.join(demoRoot, 'testing/build/testcard'));

type Decoder = { name: string; frames: (file: string, layout: Layout) => Frames };

function decodersFor(file: string): Decoder[] {
  if (/\.ktx2$/.test(file)) return [{ name: 'reference (KTX-Software)', frames: referenceKTX2 }];
  const decoders: Decoder[] = [{ name: 'reference (FFmpeg)', frames: referenceWebM }];
  // The C++ player model covers libvpx (VP8 and VP9); ffmpeg-kit decodes single VP9 streams only.
  const codec = streamCodec(file, 0);
  if (codec !== 'av1') decoders.push({ name: 'C++ player model', frames: cppModel });
  if (!isDualStream(file) && codec === 'vp9') decoders.push({ name: 'ffmpeg-kit GPU model', frames: ffmpegKitGpuModel });
  return decoders;
}

export interface Summary {
  frames: number;
  /** Frames whose colour code read back as their own index. */
  frameCodeOk: number;
  alphaCodeOk: number;
  worst: {
    corners: number;
    alphaRamp: number;
    colours: number;
    edgeColourVsAlphaPx: number;
    edgePositionPx: number;
    shearPx: number;
    movingBlockPx: number;
  };
  worstPatches: { alphaRamp: string; colours: string };
  /** The first frame's measurements, for detail. */
  firstFrame: ProbeReport;
}

const worstOf = (patches: PatchResult[]) => patches.reduce((a, b) => (b.maxError > a.maxError ? b : a));

async function summarise(frames: Frames, layout: Layout): Promise<Summary> {
  let index = 0, frameCodeOk = 0, alphaCodeOk = 0, first: ProbeReport | undefined;
  const worst = { corners: 0, alphaRamp: 0, colours: 0, edgeColourVsAlphaPx: 0, edgePositionPx: 0, shearPx: 0, movingBlockPx: 0 };
  const worstPatches = { alphaRamp: '', colours: '' };
  for await (const image of frames) {
    const r = probe(image, layout, index);
    first ??= r;
    if (r.frameCode === index) frameCodeOk++;
    if (r.alphaCode === index) alphaCodeOk++;
    worst.corners = Math.max(worst.corners, worstOf(r.corners).maxError);
    for (const key of ['alphaRamp', 'colours'] as const) {
      const w = worstOf(r[key]);
      if (w.maxError > worst[key]) { worst[key] = w.maxError; worstPatches[key] = w.name; }
    }
    const orFail = (v: number) => (Number.isNaN(v) ? Infinity : v);
    worst.edgeColourVsAlphaPx = Math.max(worst.edgeColourVsAlphaPx, orFail(r.edge.colourVsAlphaPx));
    worst.edgePositionPx = Math.max(worst.edgePositionPx, orFail(r.edge.positionErrorPx));
    worst.shearPx = Math.max(worst.shearPx, orFail(r.shearPx));
    worst.movingBlockPx = Math.max(worst.movingBlockPx, orFail(r.movingBlockErrorPx));
    index++;
  }
  return { frames: index, frameCodeOk, alphaCodeOk, worst, worstPatches, firstFrame: first! };
}

const fmt = (n: number, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : 'fail');
const results: Record<string, Record<string, Summary>> = {};
const referenceFailures: string[] = [];

for (const card of fs.readdirSync(cardsRoot).filter((d) => d.startsWith('card_')).sort()) {
  const dir = path.join(cardsRoot, card);
  const layout: Layout = JSON.parse(fs.readFileSync(path.join(dir, 'layout.json'), 'utf8'));
  const fixtures: string[] = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures.json'), 'utf8'));
  console.log(`\n${card} (${layout.frames} frames, unit ${layout.unit} px). Errors are 0-255 levels, positions in px.`);
  console.log('fixture                  decoder                    frames  code ok  alpha ok  corners  alpha ramp           colours              edge c/a  edge pos  shear  block  result');
  for (const fixture of fixtures) {
    for (const decoder of decodersFor(path.join(dir, fixture))) {
      const s = await summarise(decoder.frames(path.join(dir, fixture), layout), layout);
      (results[`${card}/${fixture}`] ??= {})[decoder.name] = s;
      const w = s.worst;
      const missed = failures(s, tolerancesFor(fixture));
      const isReference = decoder.name.startsWith('reference');
      if (isReference && missed.length > 0) referenceFailures.push(`${card}/${fixture}: ${missed.join(', ')}`);
      console.log([
        fixture.padEnd(24), decoder.name.padEnd(26), String(s.frames).padStart(6), `${s.frameCodeOk}`.padStart(8), `${s.alphaCodeOk}`.padStart(9),
        fmt(w.corners).padStart(8), `${fmt(w.alphaRamp).padStart(6)} ${s.worstPatches.alphaRamp.padEnd(13)}`,
        `${fmt(w.colours).padStart(6)} ${s.worstPatches.colours.padEnd(13)}`,
        fmt(w.edgeColourVsAlphaPx, 2).padStart(9), fmt(w.edgePositionPx, 2).padStart(9), fmt(w.shearPx, 2).padStart(6), fmt(w.movingBlockPx, 2).padStart(6),
        missed.length === 0 ? ' pass' : ` FAIL (${missed.join(', ')})`,
      ].join(' '));
    }
  }
}

fs.writeFileSync(path.join(cardsRoot, 'reference.json'), JSON.stringify(results, null, 2));
if (referenceFailures.length > 0) {
  console.error(`\nReference decoders outside tolerance:\n  ${referenceFailures.join('\n  ')}`);
  process.exit(1);
}
