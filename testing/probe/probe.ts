/**
 * Measures one decoded or captured frame against the test card layout.
 * Input pixels are premultiplied RGBA, which is what a player hands to the compositor.
 * The image may be larger or smaller than the card; coordinates are scaled to fit.
 */
import { CODE_BITS, movingBlockRect, type Layout, type Patch, type Rect, type RGBA } from '../testcard/layout.ts';

export interface Image {
  width: number;
  height: number;
  /** Premultiplied RGBA, row-major, no padding. */
  data: Uint8Array;
}

export interface PatchResult {
  name: string;
  /** Premultiplied. */
  expected: RGBA;
  measured: RGBA;
  /** Largest absolute error over the four channels, 0-255. */
  maxError: number;
}

export interface EdgeResult {
  /** Where the colour and alpha cross 50% on each side of the square, in card pixels. */
  colour: [number, number];
  alpha: [number, number];
  expected: [number, number];
  /** Largest distance between the colour and alpha edges, in card pixels. */
  colourVsAlphaPx: number;
  /** Largest distance of either edge from where it should be, in card pixels. */
  positionErrorPx: number;
}

export interface ProbeReport {
  /** The frame index from the colour code, or null when the inverted row doesn't match. */
  frameCode: number | null;
  /** The frame index from the alpha code. */
  alphaCode: number;
  corners: PatchResult[];
  alphaRamp: PatchResult[];
  colours: PatchResult[];
  edge: EdgeResult;
  /** Largest horizontal distance of the bar's centre from where it should be, over all rows, in card pixels. */
  shearPx: number;
  /** Distance of the moving block's centre from where it should be for this frame, in card pixels. */
  movingBlockErrorPx: number;
}

export function premultiply(rgba: RGBA): RGBA {
  const a = rgba[3] / 255;
  return [rgba[0] * a, rgba[1] * a, rgba[2] * a, rgba[3]];
}

class Sampler {
  readonly image: Image;
  readonly sx: number;
  readonly sy: number;
  constructor(image: Image, layout: Layout) {
    this.image = image;
    this.sx = image.width / layout.width;
    this.sy = image.height / layout.height;
  }

  pixel(x: number, y: number): RGBA {
    const px = Math.min(this.image.width - 1, Math.max(0, Math.floor(x * this.sx)));
    const py = Math.min(this.image.height - 1, Math.max(0, Math.floor(y * this.sy)));
    const i = (py * this.image.width + px) * 4;
    const d = this.image.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }

  /** Mean over the middle half of a rect (in card pixels), away from edges that compression blurs. */
  mean(rect: Rect): RGBA {
    const x0 = Math.floor((rect.x + rect.w * 0.25) * this.sx);
    const x1 = Math.max(x0 + 1, Math.ceil((rect.x + rect.w * 0.75) * this.sx));
    const y0 = Math.floor((rect.y + rect.h * 0.25) * this.sy);
    const y1 = Math.max(y0 + 1, Math.ceil((rect.y + rect.h * 0.75) * this.sy));
    const sum = [0, 0, 0, 0];
    const d = this.image.data;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * this.image.width + x) * 4;
        for (let c = 0; c < 4; c++) sum[c] += d[i + c];
      }
    }
    const n = (x1 - x0) * (y1 - y0);
    return sum.map((v) => v / n) as RGBA;
  }
}

const luma = (p: RGBA) => (p[0] + p[1] + p[2]) / 3;

function measurePatch(s: Sampler, patch: Patch): PatchResult {
  const expected = premultiply(patch.rgba);
  const measured = s.mean(patch.rect);
  const maxError = Math.max(...measured.map((v, c) => Math.abs(v - expected[c])));
  return { name: patch.name, expected, measured, maxError };
}

function readCode(cells: Rect[], bitOf: (mean: RGBA) => boolean, s: Sampler): number {
  return cells.reduce((value, cell) => (value << 1) | (bitOf(s.mean(cell)) ? 1 : 0), 0);
}

/** Sub-pixel position where `profile` crosses half of `full`, searching outward from `from` towards `to`. */
function crossing(profile: (x: number) => number, from: number, to: number, full: number): number {
  const step = from < to ? 1 : -1;
  for (let x = from; x !== to; x += step) {
    const a = profile(x), b = profile(x + step);
    if ((a - full / 2) * (b - full / 2) <= 0 && a !== b) {
      return x + 0.5 + step * ((full / 2 - a) / (b - a));
    }
  }
  return NaN;
}

function measureEdge(s: Sampler, layout: Layout): EdgeResult {
  const sq = layout.edgeSquare.rect;
  const rows = Array.from({ length: Math.max(1, Math.round(sq.h / 2)) }, (_, i) => sq.y + Math.round(sq.h / 4) + i);
  const column = (x: number) => rows.map((y) => s.pixel(x, y));
  const alphaAt = (x: number) => column(x).reduce((sum, p) => sum + p[3], 0) / rows.length;
  const lumaAt = (x: number) => column(x).reduce((sum, p) => sum + luma(p), 0) / rows.length;
  const inside = s.mean(sq);
  const u = layout.unit;
  const left = (profile: (x: number) => number, full: number) => crossing(profile, sq.x + u, sq.x - u, full);
  const right = (profile: (x: number) => number, full: number) => crossing(profile, sq.x + sq.w - u, sq.x + sq.w + u, full);
  const colour: [number, number] = [left(lumaAt, luma(inside)), right(lumaAt, luma(inside))];
  const alpha: [number, number] = [left(alphaAt, inside[3]), right(alphaAt, inside[3])];
  const expected: [number, number] = [sq.x, sq.x + sq.w];
  return {
    colour,
    alpha,
    expected,
    colourVsAlphaPx: Math.max(Math.abs(colour[0] - alpha[0]), Math.abs(colour[1] - alpha[1])),
    positionErrorPx: Math.max(...[...colour, ...alpha].map((v, i) => Math.abs(v - expected[i % 2]))),
  };
}

/**
 * Horizontal centre of the bright feature in [x0, x1) on row y, in card pixels: luma-weighted over
 * the pixels above half the row's peak, so a faint background can't pull it sideways.
 */
function centreOnRow(s: Sampler, y: number, x0: number, x1: number): number {
  const lumas = Array.from({ length: x1 - x0 }, (_, i) => luma(s.pixel(x0 + i, y)));
  const threshold = Math.max(...lumas) / 2;
  let sum = 0, weighted = 0;
  lumas.forEach((l, i) => {
    const w = Math.max(0, l - threshold);
    sum += w;
    weighted += w * (x0 + i + 0.5);
  });
  return sum > 0 ? weighted / sum : NaN;
}

function measureShear(s: Sampler, layout: Layout): number {
  const bar = layout.bar.rect;
  const u = layout.unit;
  const expected = bar.x + bar.w / 2;
  let worst = 0;
  for (let y = bar.y + 2; y < bar.y + bar.h - 2; y++) {
    const centre = centreOnRow(s, y, 14 * u, 15 * u);
    worst = Math.max(worst, Number.isNaN(centre) ? Infinity : Math.abs(centre - expected));
  }
  return worst;
}

function measureMovingBlock(s: Sampler, layout: Layout, frame: number): number {
  const block = movingBlockRect(layout, frame);
  const m = layout.movingBlock;
  const y = block.y + Math.floor(block.h / 2);
  const centre = centreOnRow(s, y, m.x0, m.x0 + m.positions * m.step);
  return Math.abs(centre - (block.x + block.w / 2));
}

export function probe(image: Image, layout: Layout, expectedFrame?: number): ProbeReport {
  const s = new Sampler(image, layout);
  const code = readCode(layout.codeCells, (m) => luma(m) > 127.5, s);
  const inverted = readCode(layout.invertedCells, (m) => luma(m) > 127.5, s);
  const valid = (code ^ inverted) === (1 << CODE_BITS) - 1;
  const frameCode = valid ? code : null;
  return {
    frameCode,
    alphaCode: readCode(layout.alphaCodeCells, (m) => m[3] > 127.5, s),
    corners: layout.corners.map((p) => measurePatch(s, p)),
    alphaRamp: layout.alphaRamp.map((p) => measurePatch(s, p)),
    colours: layout.colours.map((p) => measurePatch(s, p)),
    edge: measureEdge(s, layout),
    shearPx: measureShear(s, layout),
    movingBlockErrorPx: measureMovingBlock(s, layout, expectedFrame ?? frameCode ?? 0),
  };
}
