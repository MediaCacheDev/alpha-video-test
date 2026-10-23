// The three sizes of demo media that `npm run media`, fetch-media and make-media take (--size).
// Whatever is in assets/media/ goes into the app, so a size also deletes the files it leaves out.

const GLOW_SOURCES = ['test_webm.webm', 'test_stream.ktx2'];

export const SIZES = {
  small: {
    download: (name) => GLOW_SOURCES.includes(name),
    make: () => false,
  },
  medium: {
    download: () => true,
    make: (output) => output !== 'manta_uncompressed.ktx2',
  },
  large: {
    download: () => true,
    make: () => true,
  },
};

export const SIZE_HELP = `\
  s  small   11 MB. Downloads Glow as a VP9 WebM and as zstd ASTC KTX2, and makes nothing, so
             it needs no tools. Plays on the WebM C++, FFmpegKit, ExoPlayer and ASTC Zstd buttons;
             Manta, APNG, AVIF and the VP8, dual-stream and Raw variants are greyed out.
  m  medium  About 335 MB. Downloads Glow and the 1080p Manta (110 MB), then makes every variant
             but Raw Manta from them: dual-stream VP9 and AV1, single- and dual-stream VP8, APNG,
             AVIF and Raw Glow. Takes about 4 minutes and needs ffmpeg, avifenc and zstd. Only Raw
             Manta is greyed out.
  l  large   About 1.2 GB. Medium, plus Raw Manta: Manta's KTX2 decompressed (879 MB), for the
             uncompressed ASTC path at 1080p.`;

/** 'small', 'medium' or 'large' for s, m, l or the full name; null for anything else. */
export function parseSize(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return Object.keys(SIZES).find((size) => size === v || size[0] === v) ?? null;
}
