/**
 * Where every feature of the test card sits, and what it should look like.
 * The generator draws from this and the probe measures against it, so the two can't drift apart.
 * Colours are straight (not premultiplied) sRGB-encoded RGBA, 0-255.
 */

export type RGBA = [number, number, number, number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Patch {
  name: string;
  rect: Rect;
  rgba: RGBA;
}

export interface Layout {
  width: number;
  height: number;
  frames: number;
  fps: number;
  keyframeInterval: number;
  /** Size of one grid cell in pixels; every feature is placed on this grid. */
  unit: number;
  /** Frame index in binary, most significant bit first: white = 1, black = 0, opaque. */
  codeCells: Rect[];
  /** The same bits inverted, so a garbled frame can't read as a valid number. */
  invertedCells: Rect[];
  /** The same bits again in the alpha channel only: white at alpha 255 = 1, alpha 0 = 0. */
  alphaCodeCells: Rect[];
  corners: Patch[];
  alphaRamp: Patch[];
  colours: Patch[];
  /** An opaque square whose colour edge and alpha edge coincide. */
  edgeSquare: Patch;
  /** A thin opaque bar down most of the frame at a fixed x; a stride error bends it. */
  bar: Patch;
  /** Moves `step` pixels right per frame, wrapping after `positions` frames. */
  movingBlock: { rgba: RGBA; y: number; size: number; x0: number; step: number; positions: number };
}

export const CODE_BITS = 12;

export function makeLayout(width: number, height: number, frames = 60, fps = 30, keyframeInterval = 30): Layout {
  const u = Math.max(8, Math.floor(Math.min(width, height) / 16));
  const cell = (col: number, row: number, cols = 1, rows = 1): Rect => ({ x: col * u, y: row * u, w: cols * u, h: rows * u });
  const row = (r: number) => Array.from({ length: CODE_BITS }, (_, i) => cell(2 + i, r));
  const patches = (r: number, specs: [string, RGBA][]): Patch[] =>
    specs.map(([name, rgba], i) => ({ name, rect: cell(2 + i, r), rgba }));
  const barWidth = Math.max(4, Math.round(u / 4));

  return {
    width,
    height,
    frames,
    fps,
    keyframeInterval,
    unit: u,
    codeCells: row(1),
    invertedCells: row(2),
    alphaCodeCells: row(3),
    corners: [
      { name: 'top-left', rect: { x: 0, y: 0, w: u, h: u }, rgba: [255, 0, 0, 255] },
      { name: 'top-right', rect: { x: width - u, y: 0, w: u, h: u }, rgba: [0, 255, 0, 255] },
      { name: 'bottom-left', rect: { x: 0, y: height - u, w: u, h: u }, rgba: [0, 0, 255, 255] },
      { name: 'bottom-right', rect: { x: width - u, y: height - u, w: u, h: u }, rgba: [255, 255, 0, 255] },
    ],
    alphaRamp: patches(5, [
      ['white a0', [255, 255, 255, 0]],
      ['white a64', [255, 255, 255, 64]],
      ['white a128', [255, 255, 255, 128]],
      ['white a191', [255, 255, 255, 191]],
      ['white a255', [255, 255, 255, 255]],
      ['red a64', [255, 0, 0, 64]],
      ['red a128', [255, 0, 0, 128]],
      ['red a191', [255, 0, 0, 191]],
      ['red a255', [255, 0, 0, 255]],
    ]),
    colours: patches(7, [
      ['black', [0, 0, 0, 255]],
      ['white', [255, 255, 255, 255]],
      ['grey 128', [128, 128, 128, 255]],
      ['red 191', [191, 0, 0, 255]],
      ['green 191', [0, 191, 0, 255]],
      ['blue 191', [0, 0, 191, 255]],
      ['skin', [224, 172, 105, 255]],
      ['grey 64', [64, 64, 64, 255]],
      ['grey 192', [192, 192, 192, 255]],
    ]),
    edgeSquare: { name: 'edge square', rect: cell(2, 9, 4, 4), rgba: [64, 160, 224, 255] },
    bar: {
      name: 'bar',
      rect: { x: Math.round(14.25 * u), y: u, w: barWidth, h: height - 2 * u },
      rgba: [255, 255, 255, 255],
    },
    movingBlock: { rgba: [255, 128, 0, 255], y: 14 * u, size: u, x0: 2 * u, step: u, positions: 12 },
  };
}

export function movingBlockRect(layout: Layout, frame: number): Rect {
  const m = layout.movingBlock;
  return { x: m.x0 + (frame % m.positions) * m.step, y: m.y, w: m.size, h: m.size };
}

export function frameBits(frame: number): boolean[] {
  return Array.from({ length: CODE_BITS }, (_, i) => ((frame >> (CODE_BITS - 1 - i)) & 1) === 1);
}
