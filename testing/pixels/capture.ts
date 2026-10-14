/**
 * Turns screenshots of the pixel-test screen into probe images.
 */
import type { Image } from '../probe/probe.ts';
import type { Screenshot } from './device.ts';
import { MARKER_DP, screenLayout, type PxRect, type ScreenLayout } from './screen.ts';

const isMagenta = (s: Screenshot, x: number, y: number) => {
  const i = (y * s.width + x) * 4;
  return s.data[i] > 200 && s.data[i + 1] < 60 && s.data[i + 2] > 200;
};

/**
 * Where the screen put everything, from the magenta marker: its width gives pixels per dp, its
 * corner the origin. Null when the marker isn't on screen (the test screen isn't showing).
 */
export function findLayout(s: Screenshot, card: { width: number; height: number }): ScreenLayout | null {
  // The marker's top row is the first magenta run; anything magenta below it is not part of it.
  let x0 = -1, y0 = -1;
  for (let y = 0; y < s.height / 4 && x0 < 0; y++) {
    for (let x = 0; x < s.width / 4; x++) {
      if (isMagenta(s, x, y)) {
        x0 = x;
        y0 = y;
        break;
      }
    }
  }
  if (x0 < 0) return null;
  let x1 = x0;
  while (x1 + 1 < s.width && isMagenta(s, x1 + 1, y0)) x1++;
  const pxPerDp = (x1 - x0 + 1) / MARKER_DP.size;
  const layout = screenLayout(card, s.width, pxPerDp);
  const dx = x0 - layout.marker.x, dy = y0 - layout.marker.y;
  const shift = (r: PxRect): PxRect => ({ ...r, x: r.x + dx, y: r.y + dy });
  return {
    marker: shift(layout.marker),
    background: shift(layout.background),
    player: shift(layout.player),
    control: shift(layout.control),
  };
}

/** The rect as an opaque image, for reading frame codes and corner colours. */
export function crop(s: Screenshot, r: PxRect): Image {
  const data = new Uint8Array(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) {
    const from = ((r.y + y) * s.width + r.x) * 4;
    data.set(s.data.subarray(from, from + r.w * 4), y * r.w * 4);
  }
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width: r.w, height: r.h, data };
}

/**
 * Premultiplied RGBA from the same rect over black and over white: over black a pixel is c·a,
 * over white c·a + (1 − a), so a = 1 − (white − black).
 */
export function unblend(black: Screenshot, white: Screenshot, r: PxRect): Image {
  const b = crop(black, r), w = crop(white, r);
  const data = new Uint8Array(b.data.length);
  for (let i = 0; i < data.length; i += 4) {
    const diff = (w.data[i] - b.data[i] + w.data[i + 1] - b.data[i + 1] + w.data[i + 2] - b.data[i + 2]) / 3;
    data[i] = b.data[i];
    data[i + 1] = b.data[i + 1];
    data[i + 2] = b.data[i + 2];
    data[i + 3] = Math.max(0, Math.min(255, Math.round(255 - diff)));
  }
  return { width: r.w, height: r.h, data };
}

/** Mean luma of a rect, 0-255. */
export function meanLuma(s: Screenshot, r: PxRect): number {
  let sum = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = (y * s.width + x) * 4;
      sum += s.data[i] + s.data[i + 1] + s.data[i + 2];
    }
  }
  return sum / (3 * r.w * r.h);
}
