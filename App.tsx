import React, { useState, useCallback } from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  Dimensions,
  Image,
  Text,
  TouchableOpacity,
  Switch,
  NativeModules,
  Platform,
} from 'react-native';

const { KeepAwake } = NativeModules;
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
// Using basic PanResponder instead of gesture-handler
import {
  CheckerboardBackground,
  DraggableContainer,
  PerformancePanel,
  SpawnControls,
} from './src/components';
import { usePerformanceMetrics } from './src/hooks/usePerformanceMetrics';

// Import players - all have web support
import { KTX2PlayerView } from 'react-native-ktx2player';
import { WebMAlphaView } from 'react-native-webm-alpha-player-js';
import { WebMAlphaView as WebMAlphaViewCpp } from 'react-native-webm-alpha-player';
import { ApngView } from 'react-native-apng-player';

const KTX2_ASSET = require('./src/assets/test.ktx2');
const KTX2_STREAM_ASSET = require('./src/assets/test_stream.ktx2.zst');
const KTX2_UNCOMPRESSED_ASSET = require('./src/assets/test_uncompressed.ktx2');
const WEBM_ASSET = require('./src/assets/test_webm.webm');
const APNG_ASSET = require('./src/assets/test_apng.apng');
const AVIF_ASSET = require('./src/assets/test_avif.avif');

// Cross-platform asset resolver (Image.resolveAssetSource doesn't exist on web)
function resolveAssetUri(asset: any): string | undefined {
  if (Platform.OS === 'web') {
    // On web with webpack, require() returns the URL string directly
    if (typeof asset === 'string') return asset;
    if (asset?.default) return asset.default;
    if (asset?.uri) return asset.uri;
    return undefined;
  }
  // Native platforms
  return Image.resolveAssetSource(asset)?.uri;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PLAYER_SIZE = 150;

interface AnimationInstance {
  id: string;
  type: 'ktx2' | 'ktx2stream' | 'ktx2uncompressed' | 'webm' | 'webmcpp' | 'apng' | 'avif';
  x: number;
  y: number;
  zIndex: number;
}

let instanceCounter = 0;

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  // Prevent screen from sleeping
  KeepAwake?.activate();
  
  const insets = useSafeAreaInsets();
  const [instances, setInstances] = useState<AnimationInstance[]>([]);
  
  // Streaming settings for WebM C++
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [streamCacheSize, setStreamCacheSize] = useState(30);
  const [streamPrefetchAhead, setStreamPrefetchAhead] = useState(15);
  
  // GPU playback for KTX2/ASTC
  const [gpuPlayback, setGpuPlayback] = useState(false);
  
  // Streaming settings for KTX2 ZST (minimal memory defaults)
  const [ktx2RingSize, setKtx2RingSize] = useState(8);
  const [ktx2CacheSize, setKtx2CacheSize] = useState(20);
  const [ktx2PrefetchAhead, setKtx2PrefetchAhead] = useState(15);
  const [ktx2MemoryStrategy, setKtx2MemoryStrategy] = useState<'ram' | 'vram'>('vram');

  const ktx2Count = instances.filter(i => i.type === 'ktx2').length;
  const ktx2ZstCount = instances.filter(i => i.type === 'ktx2stream').length;
  const ktx2UncompressedCount = instances.filter(i => i.type === 'ktx2uncompressed').length;
  const webmCount = instances.filter(i => i.type === 'webm').length;
  const webmCppCount = instances.filter(i => i.type === 'webmcpp').length;
  const apngCount = instances.filter(i => i.type === 'apng').length;
  const avifCount = instances.filter(i => i.type === 'avif').length;
  const metrics = usePerformanceMetrics(ktx2Count, ktx2ZstCount, ktx2UncompressedCount, webmCount, webmCppCount, apngCount, avifCount);

  // Resolve asset URIs (cross-platform)
  const ktx2Uri = resolveAssetUri(KTX2_ASSET);
  const ktx2StreamUri = resolveAssetUri(KTX2_STREAM_ASSET);
  const ktx2UncompressedUri = resolveAssetUri(KTX2_UNCOMPRESSED_ASSET);
  const webmUri = resolveAssetUri(WEBM_ASSET);
  const apngUri = resolveAssetUri(APNG_ASSET);
  const avifUri = resolveAssetUri(AVIF_ASSET);

  const getRandomPosition = useCallback(() => {
    const maxX = SCREEN_WIDTH - PLAYER_SIZE - 40;
    const maxY = SCREEN_HEIGHT - PLAYER_SIZE - 200;
    return {
      x: Math.random() * Math.max(0, maxX) + 20,
      y: Math.random() * Math.max(0, maxY) + 100,
    };
  }, []);

  const spawnKTX2 = useCallback(() => {
    const pos = getRandomPosition();
    const newInstance: AnimationInstance = {
      id: `ktx2-${++instanceCounter}`,
      type: 'ktx2',
      x: pos.x,
      y: pos.y,
      zIndex: instances.length,
    };
    setInstances(prev => [...prev, newInstance]);
  }, [instances.length, getRandomPosition]);

  const spawnKTX2Stream = useCallback(() => {
    const pos = getRandomPosition();
    const newInstance: AnimationInstance = {
      id: `ktx2stream-${++instanceCounter}`,
      type: 'ktx2stream',
      x: pos.x,
      y: pos.y,
      zIndex: instances.length,
    };
    setInstances(prev => [...prev, newInstance]);
  }, [instances.length, getRandomPosition]);

  const spawnKTX2Uncompressed = useCallback(() => {
    const pos = getRandomPosition();
    const newInstance: AnimationInstance = {
      id: `ktx2uncompressed-${++instanceCounter}`,
      type: 'ktx2uncompressed',
      x: pos.x,
      y: pos.y,
      zIndex: instances.length,
    };
    setInstances(prev => [...prev, newInstance]);
  }, [instances.length, getRandomPosition]);

  const spawnWebM = useCallback(() => {
    const pos = getRandomPosition();
    const newInstance: AnimationInstance = {
      id: `webm-${++instanceCounter}`,
      type: 'webm',
      x: pos.x,
      y: pos.y,
      zIndex: instances.length,
    };
    setInstances(prev => [...prev, newInstance]);
  }, [instances.length, getRandomPosition]);

  const spawnWebMCpp = useCallback(() => {
    const pos = getRandomPosition();
    const newInstance: AnimationInstance = {
      id: `webmcpp-${++instanceCounter}`,
      type: 'webmcpp',
      x: pos.x,
      y: pos.y,
      zIndex: instances.length,
    };
    setInstances(prev => [...prev, newInstance]);
  }, [instances.length, getRandomPosition]);

  const spawnApng = useCallback(() => {
    const pos = getRandomPosition();
    const newInstance: AnimationInstance = {
      id: `apng-${++instanceCounter}`,
      type: 'apng',
      x: pos.x,
      y: pos.y,
      zIndex: instances.length,
    };
    setInstances(prev => [...prev, newInstance]);
  }, [instances.length, getRandomPosition]);

  const spawnAvif = useCallback(() => {
    const pos = getRandomPosition();
    const newInstance: AnimationInstance = {
      id: `avif-${++instanceCounter}`,
      type: 'avif',
      x: pos.x,
      y: pos.y,
      zIndex: instances.length,
    };
    setInstances(prev => [...prev, newInstance]);
  }, [instances.length, getRandomPosition]);

  const handleZIndexChange = useCallback((id: string, newZIndex: number) => {
    setInstances(prev =>
      prev.map(inst => (inst.id === id ? { ...inst, zIndex: newZIndex } : inst))
    );
  }, []);

  const handleRemove = useCallback((id: string) => {
    setInstances(prev => prev.filter(inst => inst.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setInstances([]);
    instanceCounter = 0;
  }, []);

  return (
    <View style={styles.container}>
      {/* Checkerboard background for transparency demo */}
      <CheckerboardBackground />

      {/* Title */}
      <View style={[styles.titleBar, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Alpha Video Test</Text>
        <Text style={styles.subtitle}>ASTC / WebM / APNG / AVIF Comparison</Text>
      </View>

      {/* Animation instances */}
      {instances.map(instance => (
        <DraggableContainer
          key={instance.id}
          id={instance.id}
          type={instance.type}
          initialX={instance.x}
          initialY={instance.y}
          zIndex={instance.zIndex}
          onZIndexChange={handleZIndexChange}
          onRemove={handleRemove}
        >
          {instance.type === 'ktx2' ? (
            <KTX2PlayerView
              style={{ width: PLAYER_SIZE, height: PLAYER_SIZE }}
              source={{ uri: ktx2Uri }}
              memoryStrategy={ktx2MemoryStrategy}
              autoPlay
              loop
              gpuPlayback={gpuPlayback}
            />
          ) : instance.type === 'ktx2stream' ? (
            <KTX2PlayerView
              style={{ width: PLAYER_SIZE, height: PLAYER_SIZE }}
              source={{ uri: ktx2StreamUri }}
              memoryStrategy={ktx2MemoryStrategy}
              autoPlay
              loop
              gpuPlayback={gpuPlayback}
              streamingRingSize={ktx2RingSize}
              streamingCacheSize={ktx2CacheSize}
              streamingPrefetchAhead={ktx2PrefetchAhead}
            />
          ) : instance.type === 'ktx2uncompressed' ? (
            <KTX2PlayerView
              style={{ width: PLAYER_SIZE, height: PLAYER_SIZE }}
              source={{ uri: ktx2UncompressedUri }}
              memoryStrategy={ktx2MemoryStrategy}
              autoPlay
              loop
              gpuPlayback={gpuPlayback}
              streamingRingSize={ktx2RingSize}
              streamingCacheSize={ktx2CacheSize}
              streamingPrefetchAhead={ktx2PrefetchAhead}
            />
          ) : instance.type === 'webm' ? (
            <WebMAlphaView
              style={{ width: PLAYER_SIZE, height: PLAYER_SIZE }}
              source={{ uri: webmUri }}
              autoPlay
              loop
            />
          ) : instance.type === 'webmcpp' ? (
            <WebMAlphaViewCpp
              style={{ width: PLAYER_SIZE, height: PLAYER_SIZE }}
              source={{ uri: webmUri }}
              autoPlay
              loop
              stream={streamEnabled}
              streamCacheSize={streamCacheSize}
              streamPrefetchAhead={streamPrefetchAhead}
            />
          ) : instance.type === 'apng' ? (
            <ApngView
              style={{ width: PLAYER_SIZE, height: PLAYER_SIZE }}
              source={{ uri: apngUri }}
              autoPlay
              loop
            />
          ) : (
            <ApngView
              style={{ width: PLAYER_SIZE, height: PLAYER_SIZE }}
              source={{ uri: avifUri }}
              autoPlay
              loop
            />
          )}
        </DraggableContainer>
      ))}

      {/* Streaming Settings Panel */}
      <View style={[styles.streamingPanel, { top: insets.top + 70 }]}>
        <Text style={styles.streamingTitle}>WebM C++</Text>
        <View style={styles.streamingRow}>
          <Text style={styles.streamingLabel}>Stream</Text>
          <Switch
            value={streamEnabled}
            onValueChange={setStreamEnabled}
            trackColor={{ false: '#555', true: '#4a9' }}
            thumbColor={streamEnabled ? '#fff' : '#888'}
          />
        </View>
        <View style={styles.streamingRow}>
          <Text style={styles.streamingLabel}>Cache: {streamCacheSize}</Text>
          <View style={styles.arrowButtons}>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => setStreamCacheSize(v => Math.max(1, v - 1))}
            >
              <Text style={styles.arrowText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => setStreamCacheSize(v => Math.min(200, v + 1))}
            >
              <Text style={styles.arrowText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.streamingRow}>
          <Text style={styles.streamingLabel}>Prefetch: {streamPrefetchAhead}</Text>
          <View style={styles.arrowButtons}>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => setStreamPrefetchAhead(v => Math.max(1, v - 1))}
            >
              <Text style={styles.arrowText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => setStreamPrefetchAhead(v => Math.min(60, v + 1))}
            >
              <Text style={styles.arrowText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* KTX2/ASTC Settings Panel */}
      <View style={[styles.streamingPanel, { top: insets.top + 180 }]}>
        <Text style={styles.streamingTitle}>KTX2/ASTC</Text>
        <View style={styles.streamingRow}>
          <Text style={styles.streamingLabel}>GPU Playback</Text>
          <Switch
            value={gpuPlayback}
            onValueChange={setGpuPlayback}
            trackColor={{ false: '#555', true: '#4a9' }}
            thumbColor={gpuPlayback ? '#fff' : '#888'}
          />
        </View>
      </View>

      {/* KTX2 ZST Streaming Settings Panel */}
      <View style={[styles.streamingPanel, { top: insets.top + 250 }]}>
        <Text style={styles.streamingTitle}>KTX2 ZST</Text>
        <View style={styles.streamingRow}>
          <Text style={styles.streamingLabel}>{ktx2MemoryStrategy.toUpperCase()}</Text>
          <Switch
            value={ktx2MemoryStrategy === 'vram'}
            onValueChange={(v) => setKtx2MemoryStrategy(v ? 'vram' : 'ram')}
            trackColor={{ false: '#555', true: '#4a9' }}
            thumbColor={ktx2MemoryStrategy === 'vram' ? '#fff' : '#888'}
          />
        </View>
        <View style={styles.streamingRow}>
          <Text style={styles.streamingLabel}>Ring: {ktx2RingSize}</Text>
          <View style={styles.arrowButtons}>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => setKtx2RingSize(v => Math.max(4, v - 2))}
            >
              <Text style={styles.arrowText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => setKtx2RingSize(v => Math.min(32, v + 2))}
            >
              <Text style={styles.arrowText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.streamingRow}>
          <Text style={styles.streamingLabel}>Cache: {ktx2CacheSize}</Text>
          <View style={styles.arrowButtons}>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => setKtx2CacheSize(v => Math.max(10, v - 5))}
            >
              <Text style={styles.arrowText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => setKtx2CacheSize(v => Math.min(120, v + 5))}
            >
              <Text style={styles.arrowText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.streamingRow}>
          <Text style={styles.streamingLabel}>Prefetch: {ktx2PrefetchAhead}</Text>
          <View style={styles.arrowButtons}>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => setKtx2PrefetchAhead(v => Math.max(5, v - 5))}
            >
              <Text style={styles.arrowText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => setKtx2PrefetchAhead(v => Math.min(60, v + 5))}
            >
              <Text style={styles.arrowText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Spawn controls */}
      <View style={[styles.controlsContainer, { bottom: insets.bottom + 110 }]}>
        <SpawnControls
          onSpawnKTX2={spawnKTX2}
          onSpawnKTX2Stream={spawnKTX2Stream}
          onSpawnKTX2Uncompressed={spawnKTX2Uncompressed}
          onSpawnWebM={spawnWebM}
          onSpawnWebMCpp={spawnWebMCpp}
          onSpawnApng={spawnApng}
          onSpawnAvif={spawnAvif}
          onClearAll={clearAll}
        />
      </View>

      {/* Performance metrics panel */}
      <View style={[styles.metricsContainer, { paddingBottom: insets.bottom }]}>
        <PerformancePanel metrics={metrics} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    // Ensure container fills viewport on web
    ...(Platform.OS === 'web' ? { height: '100vh', width: '100vw' } : {}),
  },
  titleBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 1000,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    color: '#aaa',
    fontSize: 12,
    textAlign: 'center',
  },
  controlsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    // Ensure absolute positioning works on web
    ...(Platform.OS === 'web' ? { width: '100%' } : {}),
  },
  metricsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    // Ensure absolute positioning works on web
    ...(Platform.OS === 'web' ? { width: '100%' } : {}),
  },
  streamingPanel: {
    position: 'absolute',
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    padding: 8,
    zIndex: 1001,
  },
  streamingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 2,
    minWidth: 140,
  },
  streamingTitle: {
    color: '#aaa',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  streamingLabel: {
    color: '#fff',
    fontSize: 12,
    marginRight: 8,
  },
  arrowButtons: {
    flexDirection: 'row',
  },
  arrowBtn: {
    backgroundColor: '#555',
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginLeft: 4,
    borderRadius: 4,
  },
  arrowText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default App;
