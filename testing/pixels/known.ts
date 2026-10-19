/**
 * Cases that fail for a known reason. A listed case that fails is reported as known and doesn't
 * fail the run; one that passes does, so the entry gets removed. Each pattern matches
 * "<platform> <card>/<fixture> <player> <mode>[ <decoder>][ <memoryStrategy>]", the mode being
 * "default" when unset.
 * `emulatorOnly` entries apply on an emulator or simulator, not on real hardware.
 */
export const KNOWN_ISSUES: { match: RegExp; reason: string; emulatorOnly?: boolean }[] = [
  {
    match: /^android card_383x217\/(dual_vp9_p0|yuva|dual_vp8|yuva_vp8)\.webm cpp default( mediacodec-hw)?( play)?$/,
    reason: 'The emulator\'s MediaCodec VP9 and VP8 decoders reject 383x217 (BAD_VALUE), and AlphaVideoView has no software fallback once MediaCodec is chosen',
    emulatorOnly: true,
  },
  {
    match: /^android card_1920x1080\/yuva\.webm cpp default( mediacodec-hw)?$/,
    reason: 'Emulator: the goldfish VP9 decoder treats a 1080p alpha stream as limited range, though libvpx stores BlockAdditional alpha full range (256x256 is right)',
    emulatorOnly: true,
  },
  {
    match: /^android card_\d+x\d+\/yuva_vp8\.webm cpp default( mediacodec-hw| mediacodec-sw)?$/,
    reason: 'Emulator: no GL_EXT_YUV_target, and the driver converts both VP8 decoders\' BlockAdditional alpha as limited range at every size (goldfish VP9 does at 1080p), 15 levels off',
    emulatorOnly: true,
  },
  {
    match: /^android card_\d+x\d+\/yuva\.webm cpp default mediacodec-sw( play)?$/,
    reason: 'Emulator: no GL_EXT_YUV_target, and the driver converts the software VP9 decoder\'s alpha 15 levels off, though the decoder reports it full range as asked (and BT.601 colours at 1080p)',
    emulatorOnly: true,
  },
  {
    match: /^android card_1920x1080\/(dual_av1\.webm cpp default|dual_(av1|vp9_p0)\.webm cpp default mediacodec-sw)$/,
    reason: 'Emulator: no GL_EXT_YUV_target, so the driver converts the software decoders\' frames (AV1 has no other), as BT.601 whatever their colour tags',
    emulatorOnly: true,
  },
  {
    // 'auto' and 'mediacodec-sw'; the C++ core's dav1d masks SVE when the CPU lists SVE2 alone
    match: /^android card_\d+x\d+\/dual_av1_10bit\.webm cpp \S+( mediacodec-sw)?$/,
    reason: 'Emulator on Apple silicon: its CPU features list sve2, which the host can\'t run, so dav1d\'s 10-bit put_8tap_sve2 dies with SIGILL in Android\'s c2.android.av1-dav1d',
    emulatorOnly: true,
  },
];

export function knownIssueFor(label: string, emulator: boolean): string | undefined {
  return KNOWN_ISSUES.find((k) => (emulator || !k.emulatorOnly) && k.match.test(label))?.reason;
}
