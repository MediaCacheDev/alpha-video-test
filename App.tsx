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
  ExoVp9AlphaView,
} from './src/components';
import { usePerformanceMetrics } from './src/hooks/usePerformanceMetrics';

// Import players - all have web support
// import { KTX2PlayerView } from 'react-native-ktx2player';
import { AlphaVideoGpuView } from 'alpha-video-gpu';
import { WebMAlphaView } from 'react-native-webm-alpha-player-js';
import { WebMAlphaView as WebMAlphaViewCpp } from 'react-native-webm-alpha-player';
import { AnimatedImageView } from 'react-native-apng-avif';

// Asset definitions per animation
type AssetType = 'glow181' | 'manta1080p' | 'glowDual' | 'mantaDual' | 'glowDualAv1' | 'mantaDualAv1';

interface AssetFiles {
  ktx2Stream?: any;
  ktx2Uncompressed?: any;
  webm?: any;
  apng?: any;
  avif?: any;
}

const ASSETS: Record<AssetType, AssetFiles> = {
  glow181: {
    ktx2Stream: require('./src/assets/test_stream.ktx2'),
    ktx2Uncompressed: require('./src/assets/test_uncompressed.ktx2'),
    webm: require('./src/assets/test_webm.webm'),
    apng: require('./src/assets/test_apng.apng'),
    avif: require('./src/assets/test_avif.avif'),
  },
  manta1080p: {
    webm: require('./src/assets/manta_1080p_yuva.webm'),
  },
  // Dual-stream WebM files (alpha in separate VP9 stream - uses MediaCodec HW decoding)
  glowDual: {
    webm: require('./src/assets/test_webm_dual.webm'),
    // Only WebM available for dual-stream
  },
  mantaDual: {
    webm: require('./src/assets/manta_dual.webm'),
  },
  // Dual-stream AV1 files (alpha in separate AV1 stream - uses MediaCodec HW decoding)
  glowDualAv1: {
    webm: require('./src/assets/test_webm_dual_av1.webm'),
  },
  mantaDualAv1: {
    webm: require('./src/assets/manta_dual_av1.webm'),
  },
};

const ASSET_LABELS: Record<AssetType, string> = {
  glow181: 'Glow 181 (400x400)',
  manta1080p: 'Manta YUVA (1080p)',
  glowDual: 'Glow Dual VP9 (HW)',
  mantaDual: 'Manta Dual VP9 (HW)',
  glowDualAv1: 'Glow Dual AV1 (HW)',
  mantaDualAv1: 'Manta Dual AV1 (HW)',
};

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
const DEFAULT_PLAYER_SIZE = 150;

interface AnimationInstance {
  id: string;
  type: 'ktx2' | 'ktx2uncompressed' | 'webm' | 'webmcpp' | 'exovp9alpha' | 'apng' | 'avif';
  x: number;
  y: number;
  zIndex: number;
  width?: number;  // Actual file width (set after load)
  height?: number; // Actual file height (set after load)
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
  
  // Playback mode settings for WebM C++
  // 'preload' | 'stream' | 'streamAndPreload'
  const [webmMode, setWebmMode] = useState<'preload' | 'stream' | 'streamAndPreload'>('stream');
  const [useDecodeQueue, setUseDecodeQueue] = useState(true);
  const [streamCacheSize, setStreamCacheSize] = useState(30);
  const [streamPrefetchAhead, setStreamPrefetchAhead] = useState(15);
  
  // Render at real video resolution vs scaled thumbnail
  const [useRealSize, setUseRealSize] = useState(false);
  
  // GPU playback for KTX2/ASTC
  const [gpuPlayback, setGpuPlayback] = useState(false);
  
  // Stream mode for KTX2/ASTC
  const [ktx2StreamEnabled, setKtx2StreamEnabled] = useState(true);
  
  // Streaming settings for KTX2 ZST (minimal memory defaults)
  const [ktx2RingSize, setKtx2RingSize] = useState(8);
  const [ktx2CacheSize, setKtx2CacheSize] = useState(20);
  const [ktx2PrefetchAhead, setKtx2PrefetchAhead] = useState(15);
  const [ktx2MemoryStrategy, setKtx2MemoryStrategy] = useState<'ram' | 'vram'>('vram');

  // Asset selection
  const [selectedAsset, setSelectedAsset] = useState<AssetType>('glow181');

  // Settings panels visibility
  const [showSettings, setShowSettings] = useState(true);

  const ktx2Count = instances.filter(i => i.type === 'ktx2').length;
  const ktx2UncompressedCount = instances.filter(i => i.type === 'ktx2uncompressed').length;
  const webmCount = instances.filter(i => i.type === 'webm').length;
  const webmCppCount = instances.filter(i => i.type === 'webmcpp').length;
  const apngCount = instances.filter(i => i.type === 'apng').length;
  const avifCount = instances.filter(i => i.type === 'avif').length;
  const metrics = usePerformanceMetrics(ktx2Count, 0, ktx2UncompressedCount, webmCount, webmCppCount, apngCount, avifCount);

  // Resolve asset URIs - fall back to glow181 if format not available for selected asset
  const currentAsset = ASSETS[selectedAsset];
  const fallbackAsset = ASSETS.glow181;
  const ktx2StreamUri = resolveAssetUri(currentAsset.ktx2Stream || fallbackAsset.ktx2Stream);
  const ktx2UncompressedUri = resolveAssetUri(currentAsset.ktx2Uncompressed || fallbackAsset.ktx2Uncompressed);
  const webmUri = resolveAssetUri(currentAsset.webm || fallbackAsset.webm);
  const apngUri = resolveAssetUri(currentAsset.apng || fallbackAsset.apng);
  const avifUri = resolveAssetUri(currentAsset.avif || fallbackAsset.avif);

  const getRandomPosition = useCallback(() => {
    const maxX = SCREEN_WIDTH - DEFAULT_PLAYER_SIZE - 40;
    const maxY = SCREEN_HEIGHT - DEFAULT_PLAYER_SIZE - 200;
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

  const spawnExoVp9Alpha = useCallback(() => {
    const pos = getRandomPosition();
    const newInstance: AnimationInstance = {
      id: `exovp9alpha-${++instanceCounter}`,
      type: 'exovp9alpha',
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

  // Update instance dimensions when file loads
  // Handles both web (direct event) and native (nativeEvent wrapper)
  const handleInstanceLoad = useCallback((id: string, event: any) => {
    const data = event.nativeEvent || event; // Native wraps in nativeEvent, web doesn't
    const { width, height } = data;
    if (width && height) {
      setInstances(prev =>
        prev.map(inst => (inst.id === id ? { ...inst, width, height } : inst))
      );
    }
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
        <View style={styles.titleRow}>
          <View style={styles.titleSpacer} />
          <View style={styles.titleCenter}>
            <Text style={styles.title}>Alpha Video Test</Text>
            <Text style={styles.subtitle}>ASTC / WebM / APNG / AVIF Comparison</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsToggle}
            onPress={() => setShowSettings(v => !v)}
          >
            <Text style={styles.settingsToggleText}>{showSettings ? '⚙️' : '⚙️'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Asset Selector - top left */}
      {showSettings && <View style={[styles.assetSelector, { top: insets.top + 60 }]}>
        <View style={styles.assetSwitchRow}>
          <Text style={styles.assetLabel}>Real Size</Text>
          <Switch
            value={useRealSize}
            onValueChange={setUseRealSize}
            trackColor={{ false: '#555', true: '#4a9' }}
            thumbColor={useRealSize ? '#fff' : '#888'}
          />
        </View>
        <Text style={styles.assetLabel}>Asset:</Text>
        {(Object.keys(ASSETS) as AssetType[]).map(assetKey => (
          <TouchableOpacity
            key={assetKey}
            style={[
              styles.assetOption,
              selectedAsset === assetKey && styles.assetOptionSelected,
            ]}
            onPress={() => setSelectedAsset(assetKey)}
          >
            <Text style={[
              styles.assetOptionText,
              selectedAsset === assetKey && styles.assetOptionTextSelected,
            ]}>
              {ASSET_LABELS[assetKey]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>}

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
          {(() => {
            const w = useRealSize ? (instance.width || DEFAULT_PLAYER_SIZE) : DEFAULT_PLAYER_SIZE;
            const h = useRealSize ? (instance.height || DEFAULT_PLAYER_SIZE) : DEFAULT_PLAYER_SIZE;
            const sizeStyle = { width: w, height: h };

            if (instance.type === 'ktx2') return (
              <AlphaVideoGpuView
                style={sizeStyle}
                source={{ uri: ktx2StreamUri }}
                memoryStrategy={ktx2MemoryStrategy}
                autoPlay
                loop
                gpuPlayback={gpuPlayback}
                stream={ktx2StreamEnabled}
                streamingRingSize={ktx2RingSize}
                streamingCacheSize={ktx2CacheSize}
                streamingPrefetchAhead={ktx2PrefetchAhead}
                onLoad={(e: any) => handleInstanceLoad(instance.id, e)}
              />
            );
            if (instance.type === 'ktx2uncompressed') return (
              <AlphaVideoGpuView
                style={sizeStyle}
                source={{ uri: ktx2UncompressedUri }}
                memoryStrategy={ktx2MemoryStrategy}
                autoPlay
                loop
                gpuPlayback={gpuPlayback}
                streamingRingSize={ktx2RingSize}
                streamingCacheSize={ktx2CacheSize}
                streamingPrefetchAhead={ktx2PrefetchAhead}
                onLoad={(e: any) => handleInstanceLoad(instance.id, e)}
              />
            );
            if (instance.type === 'webm') return (
              <WebMAlphaView
                style={sizeStyle}
                source={{ uri: webmUri }}
                autoPlay
                loop
              />
            );
            if (instance.type === 'webmcpp') return (
              <WebMAlphaViewCpp
                style={sizeStyle}
                source={{ uri: webmUri }}
                autoPlay
                loop
                verbose={false}
                mode={webmMode}
                useDecodeQueue={useDecodeQueue}
                streamCacheSize={streamCacheSize}
                streamPrefetchAhead={streamPrefetchAhead}
                onLoad={(e: any) => handleInstanceLoad(instance.id, e)}
              />
            );
            if (instance.type === 'exovp9alpha') return (
              <ExoVp9AlphaView
                style={sizeStyle}
                source={{ uri: webmUri }}
                autoPlay
                loop
              />
            );
            if (instance.type === 'apng') return (
              <AnimatedImageView
                style={sizeStyle}
                source={{ uri: apngUri || '' }}
                autoPlay
                loop
              />
            );
            if (instance.type === 'avif') return (
              <AnimatedImageView
                style={sizeStyle}
                source={{ uri: avifUri || '' }}
                autoPlay
                loop
              />
            );
            return <View style={sizeStyle} />;
          })()}
        </DraggableContainer>
      ))}

      {/* WebM C++ Settings Panel */}
      {showSettings && <View style={[styles.streamingPanel, { top: insets.top + 70 }]}>
        <Text style={styles.streamingTitle}>WebM C++</Text>
        <View style={styles.streamingRow}>
          <Text style={styles.streamingLabel}>Mode</Text>
          <View style={styles.modeButtons}>
            <TouchableOpacity
              style={[styles.modeBtn, webmMode === 'preload' && styles.modeBtnActive]}
              onPress={() => setWebmMode('preload')}
            >
              <Text style={[styles.modeBtnText, webmMode === 'preload' && styles.modeBtnTextActive]}>Pre</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, webmMode === 'stream' && styles.modeBtnActive]}
              onPress={() => setWebmMode('stream')}
            >
              <Text style={[styles.modeBtnText, webmMode === 'stream' && styles.modeBtnTextActive]}>Str</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, webmMode === 'streamAndPreload' && styles.modeBtnActive]}
              onPress={() => setWebmMode('streamAndPreload')}
            >
              <Text style={[styles.modeBtnText, webmMode === 'streamAndPreload' && styles.modeBtnTextActive]}>Hyb</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.streamingRow}>
          <Text style={styles.streamingLabel}>DecodeQ</Text>
          <Switch
            value={useDecodeQueue}
            onValueChange={setUseDecodeQueue}
            trackColor={{ false: '#555', true: '#4a9' }}
            thumbColor={useDecodeQueue ? '#fff' : '#888'}
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
      </View>}

      {/* KTX2/ASTC Settings Panel */}
      {showSettings && <View style={[styles.streamingPanel, { top: insets.top + 220 }]}>
        <Text style={styles.streamingTitle}>KTX2/ASTC</Text>
        <View style={styles.streamingRow}>
          <Text style={styles.streamingLabel}>Stream</Text>
          <Switch
            value={ktx2StreamEnabled}
            onValueChange={setKtx2StreamEnabled}
            trackColor={{ false: '#555', true: '#4a9' }}
            thumbColor={ktx2StreamEnabled ? '#fff' : '#888'}
          />
        </View>
        <View style={styles.streamingRow}>
          <Text style={styles.streamingLabel}>GPU Playback</Text>
          <Switch
            value={gpuPlayback}
            onValueChange={setGpuPlayback}
            trackColor={{ false: '#555', true: '#4a9' }}
            thumbColor={gpuPlayback ? '#fff' : '#888'}
          />
        </View>
      </View>}

      {/* KTX2 ZST Streaming Settings Panel */}
      {showSettings && <View style={[styles.streamingPanel, { top: insets.top + 320 }]}>
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
      </View>}

      {/* Spawn controls */}
      <View style={[styles.controlsContainer, { bottom: insets.bottom + 130 }]}>
        <SpawnControls
          onSpawnKTX2={spawnKTX2}
          onSpawnKTX2Uncompressed={spawnKTX2Uncompressed}
          onSpawnWebM={spawnWebM}
          onSpawnWebMCpp={spawnWebMCpp}
          onSpawnExoVp9Alpha={Platform.OS === 'android' ? spawnExoVp9Alpha : undefined}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleSpacer: {
    width: 40,
  },
  titleCenter: {
    flex: 1,
    alignItems: 'center',
  },
  settingsToggle: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsToggleText: {
    fontSize: 20,
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
    ...(Platform.OS === 'web' ? { 
      width: '100%',
      position: 'fixed',
    } : {}),
  },
  metricsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    // Ensure absolute positioning works on web
    ...(Platform.OS === 'web' ? { 
      width: '100%',
      position: 'fixed',
    } : {}),
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
  modeButtons: {
    flexDirection: 'row',
  },
  modeBtn: {
    backgroundColor: '#555',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 4,
    borderRadius: 4,
  },
  modeBtnActive: {
    backgroundColor: '#4a9',
  },
  modeBtnText: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: 'bold',
  },
  modeBtnTextActive: {
    color: '#fff',
  },
  assetSelector: {
    position: 'absolute',
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    padding: 8,
    zIndex: 1001,
  },
  assetLabel: {
    color: '#aaa',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  assetSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  assetOption: {
    backgroundColor: '#555',
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginVertical: 2,
    borderRadius: 4,
  },
  assetOptionSelected: {
    backgroundColor: '#4a9',
  },
  assetOptionText: {
    color: '#aaa',
    fontSize: 11,
  },
  assetOptionTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default App;
