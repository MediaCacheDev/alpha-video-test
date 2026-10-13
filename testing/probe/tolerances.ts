/**
 * How far a decoded frame may be from the test card and still count as correct.
 *
 * The level limits are the worst error of the reference decoders on these cards (FFmpeg on the
 * WebMs: 3 levels; KTX-Software on the KTX2 files: under 1) plus a margin of 3 levels, so a pass
 * means "as good as the reference" and a colour-range or premultiplication bug (20+ levels) fails.
 * Positions allow 1 px: a stride or chroma-offset bug moves features by whole pixels or more.
 */
export interface Tolerances {
  levels: number;
  positionPx: number;
}

export const decodedFrameTolerances = {
  webm: { levels: 6, positionPx: 1 },
  ktx2: { levels: 3, positionPx: 1 },
} satisfies Record<string, Tolerances>;

export function tolerancesFor(file: string): Tolerances {
  return /\.ktx2(\.zst)?$/.test(file) ? decodedFrameTolerances.ktx2 : decodedFrameTolerances.webm;
}

export interface Measured {
  frames: number;
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
}

/** Every way `m` misses the card, as short phrases; empty when it passes. */
export function failures(m: Measured, t: Tolerances): string[] {
  const out: string[] = [];
  if (m.frameCodeOk !== m.frames) out.push(`frame code ${m.frameCodeOk}/${m.frames}`);
  if (m.alphaCodeOk !== m.frames) out.push(`alpha code ${m.alphaCodeOk}/${m.frames}`);
  for (const key of ['corners', 'alphaRamp', 'colours'] as const) {
    if (!(m.worst[key] <= t.levels)) out.push(`${key} ${m.worst[key].toFixed(1)}`);
  }
  for (const key of ['edgeColourVsAlphaPx', 'edgePositionPx', 'shearPx', 'movingBlockPx'] as const) {
    if (!(m.worst[key] <= t.positionPx)) out.push(`${key.replace(/Px$/, '')} ${m.worst[key].toFixed(2)} px`);
  }
  return out;
}
