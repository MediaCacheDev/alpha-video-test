/**
 * Cases that fail for a known reason. A listed case that fails is reported as known and doesn't
 * fail the run; one that passes does, so the entry gets removed. Each pattern matches
 * "<platform> <card>/<fixture> <player> <mode>", the mode being "default" when unset.
 */
export const KNOWN_ISSUES: { match: RegExp; reason: string }[] = [
  {
    match: /^android card_383x217\/dual_vp9(_p0)?\.webm cpp /,
    reason: 'The emulator\'s MediaCodec VP9 decoder rejects 383x217 (BAD_VALUE), and AlphaVideoView has no software fallback for dual-stream files',
  },
  {
    match: /^android card_(256x256|1920x1080)\/dual_vp9\.webm cpp /,
    reason: 'MediaCodec garbles the profile 1 (gbrp) alpha stream',
  },
  {
    match: /^android card_1920x1080\/dual_(vp9_p0|av1)\.webm cpp /,
    reason: 'The MediaCodec path converts the BT.709 clip with BT.601 (the decoder is configured without the colour tags)',
  },
  {
    match: /^android card_\w+\/dual_av1\.webm cpp /,
    reason: 'MediaCodec AV1: a seek to the last frame never shows it (stays on the previous frame)',
  },
  {
    match: /^(android|ios) card_\w+\/uastc\.ktx2 gpu /,
    reason: 'Emulators and the simulator only: UASTC draws the magenta placeholder (no ASTC there; only native ASTC files get the software decode). Check on a device in Layer 3',
  },
  {
    match: /^android card_(383x217\/astc(6x6|8x8)|256x256\/astc8x8)\.ktx2 gpu stream$/,
    reason: 'Streaming: a seek from frame 37 to the last frame (59) never shows it',
  },
];

export function knownIssueFor(label: string): string | undefined {
  return KNOWN_ISSUES.find((k) => k.match.test(label))?.reason;
}
