// What each player can play: the clips, and for each player the variants of them it reads.
// The asset panel, the spawn buttons, the tiles and the count badges all read from here.

import mediaIndex from './media.generated.json';

// assets/media/, bundled into the APK, the iOS app and the web build (see the README's Demo media).
// A file that isn't there has no URI, so its buttons are greyed out.
const present = new Set<string>(mediaIndex.files);
const media = (file: string) => (present.has(file) ? `asset://media/${file}` : undefined);

export type ClipId = 'glow' | 'manta';

export const CLIPS: { id: ClipId; label: string; detail: string }[] = [
  { id: 'glow', label: 'Glow', detail: '400×400' },
  { id: 'manta', label: 'Manta', detail: '1080p' },
];

export type PlayerId = 'astc' | 'ffmpegkit' | 'cpp' | 'apng' | 'avif';

export interface Variant {
  id: string;
  label: string;
  /** The file for each clip; a clip without one can't be picked for this variant */
  files: Partial<Record<ClipId, string>>;
}

export interface Player {
  id: PlayerId;
  /** Section title in the asset panel */
  title: string;
  /** Tile header */
  tag: string;
  /** Spawn button, and the line under it */
  button: string;
  buttonDetail: string;
  color: string;
  variants: Variant[];
}

const SINGLE_VP9: Variant = {
  id: 'vp9',
  label: 'S-VP9',
  files: { glow: media('test_webm.webm'), manta: media('manta_1080p_yuva.webm') },
};

export const PLAYERS: Player[] = [
  {
    id: 'astc',
    title: 'ASTC (alpha-video-gpu)',
    tag: 'ASTC',
    button: '+ ASTC',
    buttonDetail: 'KTX2',
    color: '#4CAF50',
    variants: [
      { id: 'zstd', label: 'Zstd', files: { glow: media('test_stream.ktx2'), manta: media('manta_stream.ktx2') } },
      { id: 'raw', label: 'Raw', files: { glow: media('test_uncompressed.ktx2'), manta: media('manta_uncompressed.ktx2') } },
    ],
  },
  {
    id: 'ffmpegkit',
    title: 'WebM FFmpegKit',
    tag: 'FFMPEGKIT',
    button: '+ WebM',
    buttonDetail: 'FFmpegKit',
    color: '#2196F3',
    variants: [SINGLE_VP9],
  },
  {
    id: 'cpp',
    title: 'WebM C++ (alpha-video)',
    tag: 'WEBM-C++',
    button: '+ WebM',
    buttonDetail: 'C++',
    color: '#00BCD4',
    variants: [
      SINGLE_VP9,
      { id: 'dualVp9', label: 'D-VP9', files: { glow: media('test_webm_dual.webm'), manta: media('manta_dual.webm') } },
      { id: 'dualAv1', label: 'D-AV1', files: { glow: media('test_webm_dual_av1.webm'), manta: media('manta_dual_av1.webm') } },
      { id: 'vp8', label: 'S-VP8', files: { glow: media('test_webm_vp8.webm'), manta: media('manta_vp8.webm') } },
      { id: 'dualVp8', label: 'D-VP8', files: { glow: media('test_webm_dual_vp8.webm'), manta: media('manta_dual_vp8.webm') } },
    ],
  },
  {
    id: 'apng',
    title: 'APNG',
    tag: 'APNG',
    button: '+ APNG',
    buttonDetail: 'Animated PNG',
    color: '#9C27B0',
    variants: [{ id: 'apng', label: 'APNG', files: { glow: media('test_apng.apng'), manta: media('manta_apng.apng') } }],
  },
  {
    id: 'avif',
    title: 'AVIF',
    tag: 'AVIF',
    button: '+ AVIF',
    buttonDetail: 'AV1 image',
    color: '#FF5722',
    variants: [{ id: 'avif', label: 'AVIF', files: { glow: media('test_avif.avif'), manta: media('manta_avif.avif') } }],
  },
];

export const PLAYER_BY_ID = Object.fromEntries(PLAYERS.map(p => [p.id, p])) as Record<PlayerId, Player>;

/** Whether any player has a file of the clip */
export function hasClip(clip: ClipId): boolean {
  return PLAYERS.some(p => p.variants.some(v => v.files[clip]));
}

/** The first clip with a file, in catalog order */
export const DEFAULT_CLIP = CLIPS.find(c => hasClip(c.id))?.id ?? CLIPS[0].id;

/** The variant each player starts with picked */
export const DEFAULT_VARIANTS = Object.fromEntries(
  PLAYERS.map(p => [p.id, p.variants[0].id]),
) as Record<PlayerId, string>;

/**
 * What a player plays of the clip: the picked variant, or the first that has the clip when it
 * doesn't, so switching clips back returns to the pick. Undefined when no variant has the clip.
 */
export function variantFor(player: Player, clip: ClipId, picked: string): Variant | undefined {
  const withClip = player.variants.filter(v => v.files[clip]);
  return withClip.find(v => v.id === picked) ?? withClip[0];
}
