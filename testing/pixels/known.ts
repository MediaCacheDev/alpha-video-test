/**
 * Cases that fail for a known reason. A listed case that fails is reported as known and doesn't
 * fail the run; one that passes does, so the entry gets removed. Each pattern matches
 * "<platform> <card>/<fixture> <player> <mode>", the mode being "default" when unset.
 * `emulatorOnly` entries apply on an emulator or simulator, not on real hardware.
 */
export const KNOWN_ISSUES: { match: RegExp; reason: string; emulatorOnly?: boolean }[] = [
  {
    match: /^android card_383x217\/dual_vp9(_p0)?\.webm cpp /,
    reason: 'The emulator\'s MediaCodec VP9 decoder rejects 383x217 (BAD_VALUE), and AlphaVideoView has no software fallback for dual-stream files',
    emulatorOnly: true,
  },
  {
    match: /^android card_\w+\/dual_vp9\.webm cpp /,
    reason: 'MediaCodec garbles the profile 1 (gbrp) alpha stream',
  },
  {
    match: /^android card_1920x1080\/dual_av1\.webm cpp default$/,
    reason: 'Emulator: no GL_EXT_YUV_target, so the driver converts the software AV1 decoder\'s frames, as BT.601 whatever their colour tags',
    emulatorOnly: true,
  },
];

export function knownIssueFor(label: string, emulator: boolean): string | undefined {
  return KNOWN_ISSUES.find((k) => (emulator || !k.emulatorOnly) && k.match.test(label))?.reason;
}
