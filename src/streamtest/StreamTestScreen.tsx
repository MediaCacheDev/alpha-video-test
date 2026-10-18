import React, { useMemo, useRef, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { AlphaVideoView, type AlphaVideoViewRef, type Decoder } from 'react-native-alpha-video';
import type { StreamTestCase } from '../../testing/streaming/link';

/** One player on a source, reporting load, seek, end and errors to the stream-test driver. */
export function StreamTestScreen({ testCase: c }: { testCase: StreamTestCase }) {
  const [status, setStatus] = useState('loading');
  const ref = useRef<AlphaVideoViewRef>(null);
  const report = (event: string, detail = '') => {
    setStatus(detail ? `${event}: ${detail}` : event);
    const query = `id=${encodeURIComponent(c.id)}&event=${event}&detail=${encodeURIComponent(detail)}`;
    fetch(`${c.report}/event?${query}`).catch(() => {});
  };
  const source = useMemo(
    () => ({ uri: c.uri, headers: c.headers, dataSource: c.dataSource }),
    [c.uri, c.headers, c.dataSource],
  );

  const onLoad = (decoder: string) => {
    report('load', decoder);
    const seekTo = c.seekTo;
    if (seekTo == null) return;
    setTimeout(() => {
      ref.current?.seekToTime(seekTo);
      report('seek', String(seekTo));
    }, 500);
  };

  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      <AlphaVideoView
        key={c.id}
        ref={ref}
        source={source}
        cacheKey={c.cacheKey}
        storage={c.storage}
        mode={c.mode}
        decoder={c.decoder as Decoder | undefined}
        loop={c.loop ?? true}
        style={styles.player}
        onLoad={(e) => onLoad(e.decoder)}
        onError={(e) => report('error', e.error)}
        onEnd={() => report('end')}
      />
      <Text style={styles.status}>
        {c.id}: {status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  player: { marginTop: 80, width: '100%', aspectRatio: 16 / 9 },
  status: { position: 'absolute', left: 8, right: 8, bottom: 24, color: '#808080', fontSize: 12 },
});
