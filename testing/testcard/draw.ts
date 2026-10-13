import { frameBits, movingBlockRect, type Layout, type Rect, type RGBA } from './layout.ts';

/** Draws one frame of the test card as straight-alpha RGBA; everything else is transparent black. */
export function drawFrame(layout: Layout, frame: number): Uint8Array {
  const { width, height } = layout;
  const pixels = new Uint8Array(width * height * 4);
  const fill = (r: Rect, rgba: RGBA) => {
    for (let y = Math.max(0, r.y); y < Math.min(height, r.y + r.h); y++) {
      for (let x = Math.max(0, r.x); x < Math.min(width, r.x + r.w); x++) pixels.set(rgba, (y * width + x) * 4);
    }
  };

  const bits = frameBits(frame);
  bits.forEach((bit, i) => {
    fill(layout.codeCells[i], bit ? [255, 255, 255, 255] : [0, 0, 0, 255]);
    fill(layout.invertedCells[i], bit ? [0, 0, 0, 255] : [255, 255, 255, 255]);
    fill(layout.alphaCodeCells[i], [255, 255, 255, bit ? 255 : 0]);
  });
  for (const p of [...layout.corners, ...layout.alphaRamp, ...layout.colours, layout.edgeSquare, layout.bar]) {
    fill(p.rect, p.rgba);
  }
  fill(movingBlockRect(layout, frame), layout.movingBlock.rgba);
  return pixels;
}
