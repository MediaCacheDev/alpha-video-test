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
    match: /^android card_1920x1080\/dual_av1\.webm cpp default$/,
    reason: 'Emulator: AV1 from c2.android.av1-dav1d is converted as BT.601 even with every colour tag set (VP9 is right). Check on a device',
  },
];

export function knownIssueFor(label: string): string | undefined {
  return KNOWN_ISSUES.find((k) => k.match.test(label))?.reason;
}
