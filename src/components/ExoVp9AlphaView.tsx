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
   * Callback when video is loaded
   */
  onLoad?: (event: { nativeEvent: { totalFrames: number; width: number; height: number } }) => void;
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
 * ExoPlayer-based VP9 Alpha Video View
 *
 * This component renders VP9 WebM videos with alpha transparency using
 * an ExoPlayer-based decoder. It's designed to match the visual output
 * of the control WebMAlphaView (C++ player).
 *
 * Features:
 * - VP9 alpha transparency support via FFmpeg libvpx-vp9
 * - YUVA to RGBA conversion via GL shaders
 * - TextureView-based rendering (proper React Native integration)
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
