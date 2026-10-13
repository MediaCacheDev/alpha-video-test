/**
 * Decoders that turn a fixture into premultiplied RGBA frames for the probe.
 *
 * - `reference*`: a correct decode, using FFmpeg's own conversion (honours the file's range and
 *   matrix) or KTX-Software's ASTC/UASTC decoder. This sets the codec's error floor.
 * - `*Model`: the same decoded data run through a copy of what a player's code does with it
 *   (plane layout, shader maths). If a model fails where the reference passes, the player is wrong.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import type { Layout } from '../testcard/layout.ts';
import type { Image } from './probe.ts';
import { run } from '../lib/run.ts';

export type Frames = AsyncGenerator<Image>;

/** Yields stdout of an ffmpeg command in chunks of exactly `frameBytes`; a trailing partial chunk is dropped. */
async function* ffmpegChunks(args: string[], frameBytes: number): AsyncGenerator<Buffer> {
  const child = spawn('ffmpeg', ['-v', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise<number | null>((resolve) => child.on('close', resolve));
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  let chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
    chunks.push(chunk);
    length += chunk.length;
    while (length >= frameBytes) {
      const all = Buffer.concat(chunks, length);
      yield all.subarray(0, frameBytes);
      chunks = [all.subarray(frameBytes)];
      length -= frameBytes;
    }
  }
  const code = await exited;
  if (code !== 0) throw new Error(`ffmpeg ${args.join(' ')} exited with ${code}\n${stderr}`);
}

function straightToPremultiplied(rgba: Buffer, width: number, height: number): Image {
  const data = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    data[i] = Math.round(rgba[i] * a);
    data[i + 1] = Math.round(rgba[i + 1] * a);
    data[i + 2] = Math.round(rgba[i + 2] * a);
    data[i + 3] = rgba[i + 3];
  }
  return { width, height, data };
}

export function streamPixelFormat(file: string, stream: number): string {
  return run('ffprobe', ['-v', 'error', '-select_streams', `v:${stream}`, '-show_entries', 'stream=pix_fmt',
    '-of', 'default=nw=1:nk=1', file]).toString().trim();
}

export function streamCodec(file: string, stream: number): string {
  return run('ffprobe', ['-v', 'error', '-select_streams', `v:${stream}`, '-show_entries', 'stream=codec_name',
    '-of', 'default=nw=1:nk=1', file]).toString().trim();
}

export function isDualStream(file: string): boolean {
  return run('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=index', '-of', 'csv=p=0', file])
    .toString().trim().split('\n').length > 1;
}

const half = (n: number) => Math.ceil(n / 2);
const planeBytes: Record<string, (w: number, h: number) => number> = {
  yuv420p: (w, h) => w * h + 2 * half(w) * half(h),
  yuva420p: (w, h) => 2 * w * h + 2 * half(w) * half(h),
  gbrp: (w, h) => 3 * w * h,
};

// ---------------------------------------------------------------- references

/** FFmpeg's own decode and RGB conversion. Single-stream files are decoded with libvpx so alpha survives. */
export async function* referenceWebM(file: string, layout: Layout): Frames {
  const { width: w, height: h } = layout;
  const args = isDualStream(file)
    ? ['-i', file, '-filter_complex', '[0:v:0]format=rgba[c];[0:v:1]format=gray[a];[c][a]alphamerge[o]', '-map', '[o]']
    : ['-c:v', 'libvpx-vp9', '-i', file];
  for await (const frame of ffmpegChunks([...args, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], w * h * 4)) {
    yield straightToPremultiplied(frame, w, h);
  }
}

/** KTX-Software's decoder. texenc stores premultiplied colour, so the decoded bytes are used as they are. */
export async function* referenceKTX2(file: string, layout: Layout): Frames {
  const { width: w, height: h } = layout;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ktx2-ref-'));
  try {
    let ktx2 = file;
    if (file.endsWith('.zst')) {
      ktx2 = path.join(dir, 'input.ktx2');
      fs.writeFileSync(ktx2, zlib.zstdDecompressSync(fs.readFileSync(file)));
    }
    run('ktx', ['extract', '--layer', 'all', ktx2, path.join(dir, 'out')]);
    const pattern = path.join(dir, 'out', 'output_layer%d.png');
    for await (const frame of ffmpegChunks(['-start_number', '0', '-i', pattern, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], w * h * 4)) {
      yield { width: w, height: h, data: new Uint8Array(frame) };
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- player models

interface Planes {
  y: Uint8Array;
  u: Uint8Array;
  v: Uint8Array;
  a: Uint8Array;
  /** Row length of the chroma planes as stored. */
  chromaStride: number;
  /** Chroma size the player's texture covers (which can be smaller than what's stored). */
  chromaWidth: number;
  chromaHeight: number;
}

/** FFprobe's colour tags for a stream, e.g. `{ range: 'tv', space: 'bt709' }`. */
function streamColour(file: string, stream: number): { range: string; space: string } {
  const [range = 'unknown', space = 'unknown'] = run('ffprobe', ['-v', 'error', '-select_streams', `v:${stream}`,
    '-show_entries', 'stream=color_range,color_space', '-of', 'default=nw=1:nk=1', file]).toString().trim().split('\n');
  return { range, space };
}

/**
 * The players' YUV to RGB matrix (C++ `webm::yuvToRgbFor`, ffmpeg-kit `YuvToRgb`), as rows:
 * rgb = M * (y, u, v, 1) with samples in 0..1. Unknown range is limited; an unknown matrix is
 * BT.601 up to 720x576 and BT.709 above.
 */
function yuvToRgb(range: string, space: string, w: number, h: number): number[][] {
  let kr = 0.299, kb = 0.114;
  if (space === 'bt709' || (space === 'unknown' && !(w <= 720 && h <= 576))) [kr, kb] = [0.2126, 0.0722];
  else if (space.startsWith('bt2020')) [kr, kb] = [0.2627, 0.0593];
  const kg = 1 - kr - kb, rv = 2 * (1 - kr), bu = 2 * (1 - kb);
  const gu = (2 * kb * (1 - kb)) / kg, gv = (2 * kr * (1 - kr)) / kg;
  const full = range === 'pc';
  const ys = full ? 1 : 255 / 219, yo = full ? 0 : 16 / 255, cs = full ? 1 : 255 / 224, co = 128 / 255;
  return [
    [ys, 0, rv * cs, -ys * yo - rv * cs * co],
    [ys, -gu * cs, -gv * cs, -ys * yo + (gu + gv) * cs * co],
    [ys, bu * cs, 0, -ys * yo - bu * cs * co],
  ];
}

/**
 * The fragment shader shared by the C++ player and the ffmpeg-kit GPU view on Android and iOS:
 * the clip's matrix, colour premultiplied by the alpha plane.
 * Chroma is sampled at the nearest texel of a texture stretched over the frame.
 */
function shaderToImage(p: Planes, w: number, h: number, m: number[][]): Image {
  const data = new Uint8Array(w * h * 4);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  for (let y = 0; y < h; y++) {
    const cy = Math.min(p.chromaHeight - 1, Math.floor(((y + 0.5) / h) * p.chromaHeight));
    for (let x = 0; x < w; x++) {
      const cx = Math.min(p.chromaWidth - 1, Math.floor(((x + 0.5) / w) * p.chromaWidth));
      const Y = p.y[y * w + x] / 255;
      const U = p.u[cy * p.chromaStride + cx] / 255;
      const V = p.v[cy * p.chromaStride + cx] / 255;
      const a = p.a[y * w + x] / 255;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        data[i + c] = Math.round(clamp(m[c][0] * Y + m[c][1] * U + m[c][2] * V + m[c][3]) * a * 255);
      }
      data[i + 3] = Math.round(a * 255);
    }
  }
  return { width: w, height: h, data };
}

/** `YUVAFrame::copyAlphaFromAVFrame`: a limited-range Y plane used as alpha is expanded to 0-255. */
function expandAlpha(plane: Uint8Array, limited: boolean): Uint8Array {
  if (!limited) return plane;
  return plane.map((v) => Math.min(255, Math.max(0, Math.floor(((v - 16) * 255) / 219 + 0.5))));
}

/** Splits an FFmpeg yuv420p / yuva420p frame (chroma rounded up) into planes. */
function ffmpegPlanes(frame: Buffer, w: number, h: number): Omit<Planes, 'chromaWidth' | 'chromaHeight' | 'a'> & { a?: Uint8Array } {
  const ySize = w * h, cSize = half(w) * half(h);
  return {
    y: frame.subarray(0, ySize),
    u: frame.subarray(ySize, ySize + cSize),
    v: frame.subarray(ySize + cSize, ySize + 2 * cSize),
    a: frame.length >= 2 * ySize + 2 * cSize ? frame.subarray(ySize + 2 * cSize, 2 * ySize + 2 * cSize) : undefined,
    chromaStride: half(w),
  };
}

/**
 * The C++ player's software path (`YUVAFrame::copyFromAVFrame` + the shader): chroma textures are
 * half size rounded up, and for two-stream files the alpha is plane 0 of the alpha stream,
 * expanded to 0-255 when it's limited-range YUV. (On Android, two-stream files decode on
 * MediaCodec instead, which converts correctly; that path matches the reference.)
 */
export async function* cppModel(file: string, layout: Layout): Frames {
  const { width: w, height: h } = layout;
  const chroma = { chromaWidth: half(w), chromaHeight: half(h) };
  const { range, space } = streamColour(file, 0);
  const m = yuvToRgb(range, space, w, h);
  if (!isDualStream(file)) {
    for await (const frame of ffmpegChunks(['-c:v', 'libvpx-vp9', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'yuva420p', '-'],
      planeBytes.yuva420p(w, h))) {
      const p = ffmpegPlanes(frame, w, h);
      yield shaderToImage({ ...p, a: p.a!, ...chroma }, w, h, m);
    }
    return;
  }
  const alphaFormat = streamPixelFormat(file, 1);
  const alphaLimited = streamColour(file, 1).range !== 'pc' && !alphaFormat.startsWith('gbr');
  const colour = ffmpegChunks(['-i', file, '-map', '0:v:0', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-'], planeBytes.yuv420p(w, h));
  const alpha = ffmpegChunks(['-i', file, '-map', '0:v:1', '-f', 'rawvideo', '-pix_fmt', alphaFormat, '-'], planeBytes[alphaFormat](w, h));
  while (true) {
    const [c, a] = await Promise.all([colour.next(), alpha.next()]);
    if (c.done || a.done) return;
    const alphaPlane = expandAlpha(a.value.subarray(0, w * h), alphaLimited);
    yield shaderToImage({ ...ffmpegPlanes(c.value, w, h), a: alphaPlane, ...chroma }, w, h, m);
  }
}

/**
 * The ffmpeg-kit GPU view (Android and iOS): FFmpeg writes raw yuva420p, and the view slices it
 * with `YuvaLayout` (chroma half size rounded up), then runs the same shader.
 */
export async function* ffmpegKitGpuModel(file: string, layout: Layout): Frames {
  const { width: w, height: h } = layout;
  const { range, space } = streamColour(file, 0);
  const m = yuvToRgb(range, space, w, h);
  for await (const frame of ffmpegChunks(['-c:v', 'libvpx-vp9', '-i', file, '-an', '-f', 'rawvideo', '-pix_fmt', 'yuva420p', '-'],
    planeBytes.yuva420p(w, h))) {
    const p = ffmpegPlanes(frame, w, h);
    yield shaderToImage({ ...p, a: p.a!, chromaWidth: half(w), chromaHeight: half(h) }, w, h, m);
  }
}
