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

export interface Selection {
  clip: ClipId;
  variant: string;
}

/** The first clip and variant that has a file, in catalog order */
function firstSelection(player: Player): Selection {
  for (const clip of CLIPS) {
    const variant = player.variants.find(v => v.files[clip.id]);
    if (variant) return { clip: clip.id, variant: variant.id };
  }
  return { clip: CLIPS[0].id, variant: player.variants[0].id };
}

export const DEFAULT_SELECTIONS = Object.fromEntries(
  PLAYERS.map(p => [p.id, firstSelection(p)]),
) as Record<PlayerId, Selection>;

export function fileFor(player: Player, selection: Selection): string | undefined {
  return player.variants.find(v => v.id === selection.variant)?.files[selection.clip];
}

/** Picking a clip keeps the variant if it has that clip, else moves to the first variant that does */
export function selectClip(player: Player, selection: Selection, clip: ClipId): Selection {
  if (fileFor(player, { clip, variant: selection.variant })) return { clip, variant: selection.variant };
  const variant = player.variants.find(v => v.files[clip]);
  return variant ? { clip, variant: variant.id } : selection;
}

export function hasClip(player: Player, clip: ClipId): boolean {
  return player.variants.some(v => v.files[clip]);
}
