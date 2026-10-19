/**
 * Generates the test cards and every fixture made from them.
 *
 *   node testing/testcard/generate.ts [--out testing/build/testcard] [--sizes 383x217,256x256,1920x1080]
 *
 * Per size it writes layout.json, source.rgba (straight alpha, all frames), frames/f_NNN.png,
 * the WebM fixtures (ffmpeg) and, for sizes up to 512 px, the KTX2 fixtures (texenc).
 * Needs ffmpeg with libvpx (VP8 and VP9) and libsvtav1, and the encoder repo next to this one (or TEXENC=path/to/texenc.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawFrame } from './draw.ts';
import { makeLayout, type Layout } from './layout.ts';
import { run } from '../lib/run.ts';

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const texenc = process.env.TEXENC ?? path.resolve(demoRoot, '../alpha-video-gpu-encoder/texenc.js');

function option(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const outRoot = path.resolve(option('--out', path.join(demoRoot, 'testing/build/testcard')));
const sizes = option('--sizes', '383x217,256x256,1920x1080').split(',').map((s) => s.split('x').map(Number));

/** HD sizes use BT.709 like real HD footage; smaller ones BT.601, ffmpeg's default for RGB input. */
function colourOptions(layout: Layout) {
  const matrix = layout.height >= 720 ? 'bt709' : 'bt601';
  const tag = matrix === 'bt709' ? 'bt709' : 'smpte170m';
  return {
    scale: `scale=out_color_matrix=${matrix}:out_range=tv`,
    tags: ['-colorspace', tag, '-color_primaries', tag, '-color_trc', tag === 'bt709' ? 'bt709' : 'smpte170m', '-color_range', 'tv'],
  };
}

function rawInput(layout: Layout, rawPath: string): string[] {
  return ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${layout.width}x${layout.height}`, '-r', String(layout.fps), '-i', rawPath];
}

function encodeWebMs(layout: Layout, dir: string, rawPath: string): string[] {
  const { scale, tags } = colourOptions(layout);
  const gop = ['-g', String(layout.keyframeInterval), '-keyint_min', String(layout.keyframeInterval)];
  const vp9 = ['-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-auto-alt-ref', '0', ...gop];
  const ffmpeg = (args: string[]) => run('ffmpeg', ['-v', 'error', '-y', ...args]);
  const written: string[] = [];

  ffmpeg([...rawInput(layout, rawPath), '-vf', `${scale},format=yuva420p`, ...vp9, ...tags,
    '-metadata:s:v:0', 'alpha_mode=1', path.join(dir, 'yuva.webm')]);
  written.push('yuva.webm');

  // The README's dual-stream recipe: colour as stream 0, alpha as a grey video in stream 1.
  // libvpx turns `gray` into gbrp (VP9 profile 1); `yuv420p` alpha (profile 0, limited range)
  // is what the demo's own dual files and every AV1 encode carry.
  const split = `[0:v]split[c][a];[c]${scale},format=yuv420p[rgb];[a]alphaextract,format=gray[alpha]`;
  ffmpeg([...rawInput(layout, rawPath), '-filter_complex', split, '-map', '[rgb]', '-map', '[alpha]',
    ...vp9, ...tags, '-metadata:s:v:1', 'title=Alpha', path.join(dir, 'dual_vp9.webm')]);
  written.push('dual_vp9.webm');

  const splitProfile0 = split.replace('alphaextract,format=gray', 'alphaextract,format=yuv420p');
  ffmpeg([...rawInput(layout, rawPath), '-filter_complex', splitProfile0, '-map', '[rgb]', '-map', '[alpha]',
    ...vp9, ...tags, '-metadata:s:v:1', 'title=Alpha', path.join(dir, 'dual_vp9_p0.webm')]);
  written.push('dual_vp9_p0.webm');

  ffmpeg([...rawInput(layout, rawPath), '-filter_complex', split, '-map', '[rgb]', '-map', '[alpha]',
    '-c:v', 'libsvtav1', '-crf', '32', '-preset', '8', ...gop, ...tags,
    '-metadata:s:v:1', 'title=Alpha', path.join(dir, 'dual_av1.webm')]);
  written.push('dual_av1.webm');

  // 10-bit AV1 (Main profile), colour and alpha alike
  const split10 = split.replace('format=yuv420p[rgb]', 'format=yuv420p10le[rgb]').replace('format=gray[alpha]', 'format=gray10le[alpha]');
  ffmpeg([...rawInput(layout, rawPath), '-filter_complex', split10, '-map', '[rgb]', '-map', '[alpha]',
    '-c:v', 'libsvtav1', '-crf', '32', '-preset', '8', ...gop, ...tags,
    '-metadata:s:v:1', 'title=Alpha', path.join(dir, 'dual_av1_10bit.webm')]);
  written.push('dual_av1_10bit.webm');

  // VP8 has no matrix but BT.601, at any size, and no alpha format but a second 4:2:0 stream
  const vp8 = ['-c:v', 'libvpx', '-crf', '10', '-b:v', '4M', '-auto-alt-ref', '0', ...gop];
  const bt601 = colourOptions({ ...layout, height: 0 });
  ffmpeg([...rawInput(layout, rawPath), '-vf', `${bt601.scale},format=yuva420p`, ...vp8, ...bt601.tags,
    '-metadata:s:v:0', 'alpha_mode=1', path.join(dir, 'yuva_vp8.webm')]);
  written.push('yuva_vp8.webm');

  const splitVp8 = split.replace(scale, bt601.scale).replace('alphaextract,format=gray', 'alphaextract,format=yuv420p');
  ffmpeg([...rawInput(layout, rawPath), '-filter_complex', splitVp8, '-map', '[rgb]', '-map', '[alpha]',
    ...vp8, ...bt601.tags, '-metadata:s:v:1', 'title=Alpha', path.join(dir, 'dual_vp8.webm')]);
  written.push('dual_vp8.webm');
  return written;
}

const KTX2_VARIANTS: { name: string; args: string[] }[] = [
  { name: 'astc4x4.ktx2', args: ['--astc-block', '4x4'] },
  { name: 'astc4x4_nozstd.ktx2', args: ['--astc-block', '4x4', '--zstd', '0'] },
  { name: 'astc6x6.ktx2', args: ['--astc-block', '6x6'] },
  { name: 'astc8x8.ktx2', args: ['--astc-block', '8x8'] },
  { name: 'astc4x4_stream.ktx2', args: ['--astc-block', '4x4', '--use-stream-encoder'] },
  // Every 3-4 layers a seek point, so seeks restart the decoder at a zstd frame
  { name: 'astc4x4_seek.ktx2', args: ['--astc-block', '4x4', '--seek-interval', '0.25'] },
];

function encodeKTX2s(layout: Layout, dir: string, variants: typeof KTX2_VARIANTS): string[] {
  const framesDir = path.join(dir, 'frames');
  const written: string[] = [];
  for (const variant of variants) {
    const before = new Set(fs.readdirSync(dir));
    run('node', [texenc, '-y', '-i', framesDir, '-o', path.join(dir, variant.name), '-f', String(layout.fps), ...variant.args],
      { cwd: dir });
    written.push(...fs.readdirSync(dir).filter((f) => !before.has(f) && /\.ktx2$/.test(f)));
  }
  return written;
}

for (const [width, height] of sizes) {
  const layout = makeLayout(width, height);
  const dir = path.join(outRoot, `card_${width}x${height}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'layout.json'), JSON.stringify(layout, null, 2));

  const rawPath = path.join(dir, 'source.rgba');
  const fd = fs.openSync(rawPath, 'w');
  for (let i = 0; i < layout.frames; i++) fs.writeSync(fd, drawFrame(layout, i));
  fs.closeSync(fd);
  run('ffmpeg', ['-v', 'error', '-y', ...rawInput(layout, rawPath), '-start_number', '0', path.join(dir, 'frames/f_%03d.png')]);

  const fixtures = encodeWebMs(layout, dir, rawPath);
  if (Math.max(width, height) <= 512) {
    fixtures.push(...encodeKTX2s(layout, dir, KTX2_VARIANTS));
  }
  fs.writeFileSync(path.join(dir, 'fixtures.json'), JSON.stringify(fixtures, null, 2));
  console.log(`card_${width}x${height}: ${fixtures.join(', ')}`);
}
