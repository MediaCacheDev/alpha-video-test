import React from 'react';
import {
  requireNativeComponent,
  ViewProps,
  Platform,
  View,
  StyleSheet,
} from 'react-native';

export interface ExoVp9AlphaViewProps extends ViewProps {
  /**
   * Video source object containing URI
   */
  source?: {
    uri?: string;
  };
  /**
   * Whether to autoplay the video on load
   */
  autoPlay?: boolean;
  /**
   * Whether to loop the video
   */
  loop?: boolean;
  /**
   * Whether playback is paused
   */
  paused?: boolean;
  /**
   * Callback when the player is ready: the video's size, and the decoder ("libvpx-vp9 (FFmpeg 6.1)")
   */
  onLoad?: (event: { nativeEvent: { width: number; height: number; decoder: string } }) => void;
  /**
   * Callback when an error occurs
   */
  onError?: (event: { nativeEvent: { error: string } }) => void;
}

// Native component only available on Android
const NativeExoVp9AlphaView =
  Platform.OS === 'android'
    ? requireNativeComponent<ExoVp9AlphaViewProps>('RNExoVp9AlphaView')
    : null;

/**
 * ExoPlayer VP9 Alpha Video View
 *
 * Plays single-stream VP9 alpha WebM with ExoPlayer and the exoplayer_alpha fork's
 * VP9-alpha renderer (FFmpeg's libvpx-vp9). Android only.
 *
 * - ExoPlayer opens the source: asset://, file://, content:// or http(s)://
 * - Its MatroskaExtractor demuxes the WebM, and frames are decoded a few ahead of playback
 * - YUVA to RGBA conversion via GL shaders, in a TextureView
 * - Looping playback
 *
 * @example
 * ```tsx
 * <ExoVp9AlphaView
 *   style={{ width: 150, height: 150 }}
 *   source={{ uri: 'https://example.com/video.webm' }}
 *   autoPlay
 *   loop
 * />
 * ```
 */
export function ExoVp9AlphaView({
  source,
  autoPlay = true,
  loop = true,
  paused = false,
  onLoad,
  onError,
  style,
  ...props
}: ExoVp9AlphaViewProps) {
  if (Platform.OS !== 'android') {
    // On non-Android platforms, render an empty transparent view
    return <View style={[style, styles.placeholder]} {...props} />;
  }

  if (!NativeExoVp9AlphaView) {
    return <View style={[style, styles.placeholder]} {...props} />;
  }

  return (
    <NativeExoVp9AlphaView
      source={source}
      autoPlay={autoPlay}
      loop={loop}
      paused={paused}
      onLoad={onLoad}
      onError={onError}
      style={style}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: 'transparent',
  },
});

export default ExoVp9AlphaView;
