import React, { useMemo, useRef, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { AlphaVideoView, type AlphaVideoViewRef, type Decoder } from 'react-native-alpha-video';
import { AlphaVideoGpuView, type AlphaVideoGpuViewRef } from 'react-native-alpha-video-gpu';
import type { StreamTestCase } from '../../testing/streaming/link';

/** `count` players on a source (default 1), reporting load, seek, end and errors to the stream-test driver. */
export function StreamTestScreen({ testCase: c }: { testCase: StreamTestCase }) {
  const count = Math.max(1, c.count ?? 1);
  const columns = Math.ceil(Math.sqrt(count));
  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      <View style={styles.grid}>
        {Array.from({ length: count }, (_, n) => (
          <View key={n} style={{ width: `${100 / columns}%` }}>
            <TestPlayer testCase={c} id={n === 0 ? c.id : `${c.id}-${n}`} showStatus={n === 0} />
          </View>
        ))}
      </View>
    </View>
  );
}

function TestPlayer({ testCase: c, id, showStatus }: { testCase: StreamTestCase; id: string; showStatus: boolean }) {
  const [status, setStatus] = useState('loading');
  const ref = useRef<AlphaVideoViewRef & AlphaVideoGpuViewRef>(null);
  const report = (event: string, detail = '') => {
    setStatus(detail ? `${event}: ${detail}` : event);
    const query = `id=${encodeURIComponent(id)}&event=${event}&detail=${encodeURIComponent(detail)}`;
    fetch(`${c.report}/event?${query}`).catch(() => {});
  };
  const source = useMemo(
    () => ({ uri: c.uri, headers: c.headers, dataSource: c.dataSource }),
    [c.uri, c.headers, c.dataSource],
  );

  const onLoad = (detail: string) => {
    report('load', detail);
    const seekTo = c.seekTo;
    if (seekTo == null) return;
    setTimeout(() => {
      ref.current?.seekToTime(seekTo);
      report('seek', String(seekTo));
    }, 500);
  };

  return (
    <>
      {c.player === 'ktx2' ? (
        <AlphaVideoGpuView
          key={id}
          ref={ref}
          source={source}
          cacheKey={c.cacheKey}
          storage={c.storage}
          stream={c.mode === 'preload' ? false : undefined}
          memoryStrategy={c.memoryStrategy}
          streamingPrefetchAhead={c.prefetch}
          verbose={c.verbose}
          loop={c.loop ?? true}
          style={styles.player}
          onLoad={(e) => onLoad(`${e.nativeEvent.frameCount} frames`)}
          onError={(e) => report('error', e.nativeEvent.error)}
          onFinished={() => report('end')}
        />
      ) : (
        <AlphaVideoView
          key={id}
          ref={ref}
          source={source}
          cacheKey={c.cacheKey}
          storage={c.storage}
          mode={c.mode}
          decoder={c.decoder as Decoder | undefined}
          streamPrefetchAhead={c.prefetch}
          verbose={c.verbose}
          loop={c.loop ?? true}
          style={styles.player}
          onLoad={(e) => onLoad(e.decoder)}
          onError={(e) => report('error', e.error)}
          onEnd={() => report('end')}
        />
      )}
      {showStatus && (
        <Text style={styles.status}>
          {id}: {status}
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  grid: { marginTop: 80, flexDirection: 'row', flexWrap: 'wrap' },
  player: { width: '100%', aspectRatio: 16 / 9 },
  status: { position: 'absolute', left: 8, right: 8, top: -60, color: '#808080', fontSize: 12 },
});
