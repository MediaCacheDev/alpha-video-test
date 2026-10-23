#!/usr/bin/env node
// Makes the demo media that's derived from the downloaded sources, into assets/media/:
//   - from each single-stream alpha WebM (VP9 with the alpha in BlockAdditional): dual-stream VP9,
//     dual-stream AV1, single- and dual-stream VP8, APNG and AVIF
//   - from a zstd KTX2: the same ASTC layers uncompressed
// Run `npm run fetch-media` first. Files whose source and recipe haven't changed are left alone;
// a file whose source is missing is left out, and the app greys out its button.
//
//   npm run make-media [-- --force] [-- --only <regex>] [-- --skip <regex>] [-- --size s|m|l]
//
// --skip leaves out the outputs it matches and deletes them if they're there, e.g. --skip manta_uncompressed
// --size leaves out, the same way, what that size doesn't make (see media-sizes.mjs)
//
// Needs ffmpeg with libvpx and libsvtav1, avifenc and zstd (Homebrew: brew install ffmpeg libavif zstd).

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import mediaIndex from './media-index.js';
import { SIZES, parseSize } from './media-sizes.mjs';

const { writeMediaIndex } = mediaIndex;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mediaDir = path.join(root, 'assets', 'media');
const stampFile = path.join(mediaDir, '.generated.json');
const { values: args } = parseArgs({
  options: { force: { type: 'boolean' }, only: { type: 'string' }, skip: { type: 'string' }, size: { type: 'string' } },
});
const size = args.size == null ? null : parseSize(args.size);
if (args.size != null && !size) throw new Error(`--size is s, m or l, not "${args.size}"`);

const VP9 = ['-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-auto-alt-ref', '0', '-row-mt', '1'];
const AV1 = ['-c:v', 'libsvtav1', '-crf', '32', '-preset', '8'];
// libvpx's VP8 needs a bitrate cap with -crf
const VP8 = ['-c:v', 'libvpx', '-crf', '10', '-b:v', '4M', '-auto-alt-ref', '0', '-threads', '8'];

// Colour as stream 0 and alpha as a grey 4:2:0 video in stream 1, the layout alpha-video reads
const dualSplit = (colour) => `[0:v]split[c][a];[c]${colour}format=yuv420p[colour];[a]alphaextract,format=yuv420p[alpha]`;
const DUAL_SPLIT = dualSplit('');

// VP8 has one colour matrix, BT.601, and players decode it with that, so BT.709 sources are converted
const toBt601 = (info) => `scale=in_color_matrix=${info.matrix}:in_range=tv:out_color_matrix=bt601:out_range=tv,`;

const CLIPS = [
  {
    source: 'test_webm.webm', dualVp9: 'test_webm_dual.webm', dualAv1: 'test_webm_dual_av1.webm',
    vp8: 'test_webm_vp8.webm', dualVp8: 'test_webm_dual_vp8.webm', apng: 'test_apng.apng', avif: 'test_avif.avif',
  },
  {
    source: 'manta_1080p_yuva.webm', dualVp9: 'manta_dual.webm', dualAv1: 'manta_dual_av1.webm',
    vp8: 'manta_vp8.webm', dualVp8: 'manta_dual_vp8.webm', apng: 'manta_apng.apng', avif: 'manta_avif.avif',
  },
];
const UNCOMPRESSED_KTX2 = [
  { source: 'test_stream.ktx2', output: 'test_uncompressed.ktx2' },
  { source: 'manta_stream.ktx2', output: 'manta_uncompressed.ktx2' },
];

function run(command, commandArgs) {
  // SVT_LOG=2: SVT-AV1's warnings and errors, without its banner on every encode
  execFileSync(command, commandArgs, { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, SVT_LOG: '2' } });
}

const ffmpeg = (ffmpegArgs) => run('ffmpeg', ['-v', 'error', '-y', ...ffmpegArgs]);

function checkTools() {
  const missing = [];
  const listed = (flag) => execFileSync('ffmpeg', ['-hide_banner', flag], { encoding: 'utf8' });
  try {
    const encoders = listed('-encoders');
    const decoders = listed('-decoders');
    for (const name of ['libvpx-vp9', 'libvpx', 'libsvtav1', 'apng']) if (!new RegExp(` ${name} `).test(encoders)) missing.push(`ffmpeg encoder ${name}`);
    if (!/ libvpx-vp9 /.test(decoders)) missing.push('ffmpeg decoder libvpx-vp9');
  } catch {
    missing.push('ffmpeg');
  }
  for (const [tool, versionFlag] of [['avifenc', '--version'], ['zstd', '--version']]) {
    try {
      execFileSync(tool, [versionFlag], { stdio: 'ignore' });
    } catch {
      missing.push(tool);
    }
  }
  if (missing.length) throw new Error(`Missing ${missing.join(', ')}. On macOS: brew install ffmpeg libavif zstd`);
}

/** The source's frame rate and colour tags, as ffprobe reports them. */
function probe(file) {
  const output = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=r_frame_rate,color_space,color_primaries,color_transfer', '-of', 'json', file], { encoding: 'utf8' });
  const stream = JSON.parse(output).streams[0];
  const [timescale, duration] = stream.r_frame_rate.split('/').map(Number);
  return {
    timescale,
    duration,
    matrix: stream.color_space === 'bt709' ? 'bt709' : 'bt601',
    // Untagged sources stay untagged, so players pick their usual default
    tags: stream.color_space && stream.color_space !== 'unknown'
      ? ['-colorspace', stream.color_space, '-color_primaries', stream.color_primaries, '-color_trc', stream.color_transfer, '-color_range', 'tv']
      : [],
  };
}

// ffmpeg's own VP9 decoder drops the alpha, so libvpx decodes every source
const decode = (source) => ['-c:v', 'libvpx-vp9', '-i', source];

/** Straight-alpha RGBA, untagged: ffmpeg would otherwise write BT.709's gamma into the PNGs. */
const toRgba = (info) =>
  `scale=in_color_matrix=${info.matrix}:in_range=tv,format=rgba,setparams=color_primaries=unknown:color_trc=unknown:colorspace=unknown:range=unknown`;

function makeDual(codecArgs) {
  return (source, output, info) => ffmpeg([...decode(source), '-filter_complex', DUAL_SPLIT,
    '-map', '[colour]', '-map', '[alpha]', ...codecArgs, ...info.tags, '-metadata:s:v:1', 'title=Alpha', '-f', 'webm', output]);
}

function makeVp8(source, output, info) {
  ffmpeg([...decode(source), '-vf', `${toBt601(info)}format=yuva420p`, ...VP8, '-f', 'webm', output]);
}

function makeDualVp8(source, output, info) {
  ffmpeg([...decode(source), '-filter_complex', dualSplit(toBt601(info)),
    '-map', '[colour]', '-map', '[alpha]', ...VP8, '-metadata:s:v:1', 'title=Alpha', '-f', 'webm', output]);
}

function makeApng(source, output, info) {
  ffmpeg([...decode(source), '-vf', toRgba(info), '-plays', '0', '-f', 'apng', output]);
}

function makeAvif(source, output, info) {
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-video-test-frames-'));
  try {
    ffmpeg([...decode(source), '-vf', toRgba(info), path.join(frames, 'f_%05d.png')]);
    const pngs = fs.readdirSync(frames).sort().map((name) => path.join(frames, name));
    run('avifenc', ['--ignore-profile', '-s', '6', '-j', 'all', '-y', '444',
      '--timescale', String(info.timescale), '--duration', String(info.duration), ...pngs, '-o', output]);
  } finally {
    fs.rmSync(frames, { recursive: true, force: true });
  }
}

/** Rewrites a zstd KTX2 with its levels decompressed: the same ASTC blocks, header, DFD and keys. */
function makeUncompressedKtx2(source, output) {
  const file = fs.readFileSync(source);
  const ZSTD = 2;
  if (file.readUInt32LE(44) !== ZSTD) throw new Error(`${source} isn't zstd-supercompressed`);
  const levelCount = Math.max(1, file.readUInt32LE(40));
  const dfdOffset = file.readUInt32LE(48);
  const dfd = file.subarray(dfdOffset, dfdOffset + file.readUInt32LE(52));
  const kvdOffset = file.readUInt32LE(56);
  const kvd = withoutZstdParams(file.subarray(kvdOffset, kvdOffset + file.readUInt32LE(60)));

  const levels = [];
  for (let i = 0; i < levelCount; i++) {
    const offset = Number(file.readBigUInt64LE(80 + i * 24));
    const length = Number(file.readBigUInt64LE(88 + i * 24));
    const uncompressedLength = Number(file.readBigUInt64LE(96 + i * 24));
    // The zstd CLI, not node:zlib: with seek points a level is many zstd frames and a seek
    // table, and zlib stops after the first frame
    const level = execFileSync('zstd', ['-d', '-c', '-q'], { input: file.subarray(offset, offset + length), maxBuffer: uncompressedLength + 1 });
    if (level.length !== uncompressedLength) throw new Error(`${source} level ${i}: ${level.length} bytes, expected ${uncompressedLength}`);
    levels.push(level);
  }

  // Uncompressed levels are aligned to the 16-byte ASTC block, smallest level first
  const align16 = (n) => (n + 15) & ~15;
  const header = Buffer.alloc(80 + levelCount * 24);
  file.copy(header, 0, 0, 48);
  header.writeUInt32LE(0, 44);
  header.writeUInt32LE(header.length, 48);
  header.writeUInt32LE(dfd.length, 52);
  header.writeUInt32LE(header.length + dfd.length, 56);
  header.writeUInt32LE(kvd.length, 60);
  let end = header.length + dfd.length + kvd.length;
  const offsets = [];
  for (let i = levelCount - 1; i >= 0; i--) {
    offsets[i] = align16(end);
    end = offsets[i] + levels[i].length;
  }
  levels.forEach((level, i) => {
    header.writeBigUInt64LE(BigInt(offsets[i]), 80 + i * 24);
    header.writeBigUInt64LE(BigInt(level.length), 88 + i * 24);
    header.writeBigUInt64LE(BigInt(level.length), 96 + i * 24);
  });

  const fd = fs.openSync(output, 'w');
  try {
    fs.writeSync(fd, Buffer.concat([header, dfd, kvd]), 0, undefined, 0);
    levels.forEach((level, i) => fs.writeSync(fd, level, 0, level.length, offsets[i]));
  } finally {
    fs.closeSync(fd);
  }
}

/** The key/value data with the zstd level taken out of KTXwriterScParams. */
function withoutZstdParams(kvd) {
  const entries = [];
  for (let offset = 0; offset < kvd.length;) {
    const length = kvd.readUInt32LE(offset);
    let entry = kvd.subarray(offset + 4, offset + 4 + length);
    const keyEnd = entry.indexOf(0);
    if (entry.toString('latin1', 0, keyEnd) === 'KTXwriterScParams') {
      const params = entry.toString('latin1', keyEnd + 1).replace(/\0$/, '').replace(/\s*--(zcmp|zstd)( \d+)?/g, '');
      entry = Buffer.from(`KTXwriterScParams\0${params}\0`, 'latin1');
    }
    entries.push(entry);
    offset = (offset + 4 + length + 3) & ~3;
  }
  return Buffer.concat(entries.flatMap((entry) => {
    const length = Buffer.alloc(4);
    length.writeUInt32LE(entry.length);
    return [length, entry, Buffer.alloc((4 - (entry.length % 4)) % 4)];
  }));
}

const RECIPES = [
  ...CLIPS.flatMap((clip) => [
    { output: clip.dualVp9, source: clip.source, recipe: `dual ${VP9.join(' ')} ${DUAL_SPLIT}`, make: makeDual(VP9) },
    { output: clip.dualAv1, source: clip.source, recipe: `dual ${AV1.join(' ')} ${DUAL_SPLIT}`, make: makeDual(AV1) },
    { output: clip.vp8, source: clip.source, recipe: `${VP8.join(' ')} bt601`, make: makeVp8 },
    { output: clip.dualVp8, source: clip.source, recipe: `dual ${VP8.join(' ')} bt601 ${DUAL_SPLIT}`, make: makeDualVp8 },
    { output: clip.apng, source: clip.source, recipe: 'apng untagged rgba', make: makeApng },
    { output: clip.avif, source: clip.source, recipe: 'avifenc -s 6 -y 444 untagged rgba', make: makeAvif },
  ]),
  ...UNCOMPRESSED_KTX2.map(({ source, output }) => ({ output, source, recipe: 'zstd levels decompressed, every frame', make: makeUncompressedKtx2 })),
];

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const only = args.only ? new RegExp(args.only) : null;
const skip = args.skip ? new RegExp(args.skip) : null;
const leftOut = (output) => skip?.test(output) || (size && !SIZES[size].make(output));
const selected = RECIPES.filter((r) => !only || only.test(r.output));
const stamps = fs.existsSync(stampFile) ? JSON.parse(fs.readFileSync(stampFile, 'utf8')) : {};
if (selected.some((r) => !leftOut(r.output))) checkTools();

let made = 0;
for (const { output, source, recipe, make } of selected) {
  const sourcePath = path.join(mediaDir, source);
  const outputPath = path.join(mediaDir, output);
  if (leftOut(output)) {
    // Removed, not just left alone: whatever is in assets/media goes into the app
    const removed = fs.existsSync(outputPath);
    if (removed) fs.rmSync(outputPath);
    delete stamps[output];
    if (fs.existsSync(mediaDir)) fs.writeFileSync(stampFile, `${JSON.stringify(stamps, null, 2)}\n`);
    if (removed || !size) console.log(`  – ${output} ${removed ? 'removed' : 'skipped'}`);
    continue;
  }
  if (!fs.existsSync(sourcePath)) {
    console.log(`  ✘ ${output}: ${source} is missing (npm run fetch-media)`);
    continue;
  }
  made++;
  const stamp = `${sha256(sourcePath)} ${recipe}`;
  if (!args.force && stamps[output] === stamp && fs.existsSync(outputPath)) {
    console.log(`  ✔ ${output}`);
    continue;
  }

  const started = Date.now();
  const partial = `${outputPath}.part`;
  make(sourcePath, partial, source.endsWith('.webm') ? probe(sourcePath) : null);
  fs.renameSync(partial, outputPath);
  stamps[output] = stamp;
  fs.writeFileSync(stampFile, `${JSON.stringify(stamps, null, 2)}\n`);
  const megabytes = (fs.statSync(outputPath).size / 1e6).toFixed(1);
  console.log(`  ✚ ${output} from ${source} (${megabytes} MB, ${((Date.now() - started) / 1000).toFixed(0)} s)`);
}
writeMediaIndex();
console.log(`✅ ${made} variants in ${path.relative(root, mediaDir)}`);
