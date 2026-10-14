import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Image, PixelRatio, StatusBar, StyleSheet, Text, View } from 'react-native';
import { AlphaVideoView, type Decoder, type PlaybackMode } from 'react-native-alpha-video';
import { FFmpegKitAlphaCPUView, FFmpegKitAlphaGPUView } from 'react-native-alpha-video-ffmpegkit';
import { AlphaVideoGpuView } from 'react-native-alpha-video-gpu';
import {
  cardSize,
  framePng,
  screenLayout,
  type PixelTestCase,
  type PxRect,
} from '../../testing/pixels/screen';

interface Seekable {
  seekToFrame: (frame: number) => void;
}

const dp = (r: PxRect) => {
  const ratio = PixelRatio.get();
  return { position: 'absolute' as const, left: r.x / ratio, top: r.y / ratio, width: r.w / ratio, height: r.h / ratio };
};

/**
 * One player showing one frame of a test card, paused, for the pixel-test driver to capture.
 * A new link with only `frame` or `bg` changed keeps the player and seeks it.
 */
export function PixelTestScreen({ testCase: c }: { testCase: PixelTestCase }) {
  const [status, setStatus] = useState('loading');
  const ratio = PixelRatio.get();
  const layout = screenLayout(cardSize(c.card), Math.round(Dimensions.get('window').width * ratio), ratio);
  const folder = `file://${c.root}/${c.card}`;
  const playerKey = `${c.player}|${c.card}|${c.fixture}|${c.mode ?? ''}|${c.decoder ?? ''}|${c.play ? 'play' : ''}`;

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <StatusBar hidden />
      <View style={[dp(layout.marker), styles.marker]} />
      <TestPlayer
        key={playerKey}
        testCase={c}
        uri={`${folder}/${c.fixture}`}
        style={dp(layout.player)}
        onStatus={setStatus}
      />
      <Image
        source={{ uri: `${folder}/${framePng(c.frame)}` }}
        style={dp(layout.control)}
        resizeMode="stretch"
        fadeDuration={0}
      />
      <Text style={styles.status}>
        {c.player} {c.card}/{c.fixture} {c.mode ?? ''} {c.decoder ?? ''} {c.play ? 'playing' : `frame ${c.frame}`}: {status}
      </Text>
    </View>
  );
}

function TestPlayer({ testCase: c, uri, style, onStatus }: {
  testCase: PixelTestCase;
  uri: string;
  style: ReturnType<typeof dp>;
  onStatus: (status: string) => void;
}) {
  const ref = useRef<Seekable>(null);
  const loaded = useRef(false);

  // Seeks are ignored until onLoad, so the first one is made there.
  useEffect(() => {
    if (loaded.current && !c.play) ref.current?.seekToFrame(c.frame);
  }, [c.frame, c.play]);

  const onLoad = (decoder?: string) => {
    loaded.current = true;
    if (!c.play) ref.current?.seekToFrame(c.frame);
    onStatus(decoder ? `loaded on ${decoder}` : 'loaded');
  };
  const onError = (error: string) => onStatus(`error: ${error}`);
  // A new source object could reload the clip, and every link re-renders the screen.
  const source = useMemo(() => ({ uri }), [uri]);
  const common = { source, autoPlay: !!c.play, loop: !!c.play, style, onLoad: () => onLoad() };

  switch (c.player) {
    case 'cpp':
      return (
        <AlphaVideoView
          ref={ref as React.Ref<never>}
          {...common}
          mode={c.mode as PlaybackMode | undefined}
          decoder={c.decoder as Decoder | undefined}
          onLoad={(e) => onLoad(e.decoder)}
          onError={(e) => onError(e.error)}
        />
      );
    case 'ffk-gpu':
    case 'ffk-cpu': {
      const View_ = c.player === 'ffk-gpu' ? FFmpegKitAlphaGPUView : FFmpegKitAlphaCPUView;
      return (
        <View_
          ref={ref as React.Ref<never>}
          {...common}
          mode={c.mode as 'preload' | 'stream' | undefined}
          onError={(e) => onError(e.error)}
        />
      );
    }
    case 'gpu':
      return (
        <AlphaVideoGpuView
          ref={ref as React.Ref<never>}
          {...common}
          stream={c.mode === 'stream'}
          onError={(e) => onError(e.nativeEvent.error)}
        />
      );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  marker: { backgroundColor: '#ff00ff' },
  status: { position: 'absolute', left: 8, right: 8, bottom: 24, color: '#808080', fontSize: 12 },
});
