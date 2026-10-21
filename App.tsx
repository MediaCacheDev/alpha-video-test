import React, { useState, useCallback } from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  Dimensions,
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
  AssetPanel,
} from './src/components';
import {
  DEFAULT_SELECTIONS,
  PLAYER_BY_ID,
  CLIPS,
  fileFor,
  type PlayerId,
  type Selection,
} from './src/catalog';
import { usePerformanceMetrics } from './src/hooks/usePerformanceMetrics';

// Import players - all have web support
// import { KTX2PlayerView } from 'react-native-ktx2player';
import { AlphaVideoGpuView } from 'react-native-alpha-video-gpu';
import { FFmpegKitAlphaView } from 'react-native-alpha-video-ffmpegkit';
import { AlphaVideoView, type Decoder } from 'react-native-alpha-video';
import { AnimatedImageView } from 'react-native-apng-avif';

// The C++ player's decoder choices; MediaCodec exists only on Android, so iOS always uses software
const DECODER_OPTIONS: [Decoder, string][] = [
  ['auto', 'auto'],
  ['mediacodec', 'mc'],
  ['mediacodec-hw', 'mc-hw'],
  ['mediacodec-sw', 'mc-sw'],
  ['software', 'software'],
];

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DEFAULT_PLAYER_SIZE = 150;

interface AnimationInstance {
  id: string;
  player: PlayerId | 'exovp9alpha';
  /** Fixed when the player is spawned, so later picks in the asset panel don't change it */
  uri: string;
  variant: string;
  /** Clip and variant, e.g. 'Manta D-AV1' */
  label: string;
  x: number;
  y: number;
  zIndex: number;
  width?: number;  // Actual file width (set after load)
  height?: number; // Actual file height (set after load)
  decoder?: string; // Engine onLoad reported, e.g. 'mediacodec-hw' (C++ player)
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
  const [webmDecoder, setWebmDecoder] = useState<Decoder>('auto');
  const [useDecodeQueue, setUseDecodeQueue] = useState(true);
  const [streamCacheSize, setStreamCacheSize] = useState(30);
  const [streamPrefetchAhead, setStreamPrefetchAhead] = useState(15);

  // Playback mode for WebM FFmpegKit
  const [webmKitStream, setWebmKitStream] = useState(true);
  
  // Render at real video resolution vs scaled thumbnail
  const [useRealSize, setUseRealSize] = useState(false);
  
  // Stream mode for KTX2/ASTC
  const [ktx2StreamEnabled, setKtx2StreamEnabled] = useState(true);
  
  // Streaming settings for KTX2 ZST (minimal memory defaults)
  const [ktx2RingSize, setKtx2RingSize] = useState(8);
  const [ktx2CacheSize, setKtx2CacheSize] = useState(20);
  const [ktx2PrefetchAhead, setKtx2PrefetchAhead] = useState(15);
  const [ktx2MemoryStrategy, setKtx2MemoryStrategy] = useState<'ram' | 'vram'>('vram');

  // What each player's spawn button plays next
  const [selections, setSelections] = useState<Record<PlayerId, Selection>>(DEFAULT_SELECTIONS);
  const handleSelect = useCallback((player: PlayerId, selection: Selection) => {
    setSelections(prev => ({ ...prev, [player]: selection }));
  }, []);

  // Settings panels visibility
  const [showSettings, setShowSettings] = useState(true);

  const counts: Partial<Record<PlayerId, number>> = {};
  for (const inst of instances) {
    if (inst.player !== 'exovp9alpha') counts[inst.player] = (counts[inst.player] ?? 0) + 1;
  }
  const metrics = usePerformanceMetrics();

  const getRandomPosition = useCallback(() => {
    const maxX = SCREEN_WIDTH - DEFAULT_PLAYER_SIZE - 40;
    // Keeps the whole tile, header and footer included, above the spawn buttons and metrics
    const maxY = SCREEN_HEIGHT - DEFAULT_PLAYER_SIZE - 340;
    return {
      x: Math.random() * Math.max(0, maxX) + 20,
      y: Math.random() * Math.max(0, maxY) + 100,
    };
  }, []);

  const addInstance = useCallback((player: AnimationInstance['player'], selection: Selection) => {
    const catalogPlayer = PLAYER_BY_ID[player === 'exovp9alpha' ? 'ffmpegkit' : player];
    const uri = fileFor(catalogPlayer, selection);
    if (!uri) return;
    const clip = CLIPS.find(c => c.id === selection.clip)!.label;
    const variant = catalogPlayer.variants.find(v => v.id === selection.variant)!;
    const label = `${clip} ${variant.label}`;
    const pos = getRandomPosition();
    setInstances(prev => [...prev, {
      id: `${player}-${++instanceCounter}`,
      player,
      uri,
      variant: selection.variant,
      label,
      x: pos.x,
      y: pos.y,
      zIndex: prev.length,
    }]);
  }, [getRandomPosition]);

  const spawn = useCallback((player: PlayerId) => addInstance(player, selections[player]), [addInstance, selections]);

  // ExoPlayer plays single-stream VP9, so it takes the FFmpegKit player's pick
  const spawnExoVp9Alpha = useCallback(() => addInstance('exovp9alpha', selections.ffmpegkit), [addInstance, selections]);

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
    // "mediacodec (c2.qti.vp9.decoder, c2.android.vp9.decoder)" -> "mediacodec"
    const decoder: string | undefined = data.decoder?.split(' (')[0];
    if ((width && height) || decoder) {
      setInstances(prev =>
        prev.map(inst => (inst.id === id ? { ...inst, width: width || inst.width, height: height || inst.height, decoder } : inst))
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

      {showSettings && <View style={[styles.settingsColumnLeft, { top: insets.top + 60 }]}>
        {/* Real size, then what each player spawns with - top left */}
        <View style={styles.assetSelector}>
          <View style={styles.assetSwitchRow}>
            <Text style={styles.assetLabel}>Real Size</Text>
            <Switch
              value={useRealSize}
              onValueChange={setUseRealSize}
              trackColor={{ false: '#555', true: '#4a9' }}
              thumbColor={useRealSize ? '#fff' : '#888'}
            />
          </View>
        </View>

        <AssetPanel selections={selections} onSelect={handleSelect} />

      </View>}

      {/* Animation instances */}
      {instances.map(instance => (
        <DraggableContainer
          key={instance.id}
          id={instance.id}
          tag={instance.player === 'exovp9alpha' ? 'EXOPLAYER' : PLAYER_BY_ID[instance.player].tag}
          color={instance.player === 'exovp9alpha' ? '#FF9800' : PLAYER_BY_ID[instance.player].color}
          initialX={instance.x}
          initialY={instance.y}
          zIndex={instance.zIndex}
          caption={instance.decoder ? `${instance.label} | ${instance.decoder}` : instance.label}
          onZIndexChange={handleZIndexChange}
          onRemove={handleRemove}
        >
          {(() => {
            const w = useRealSize ? (instance.width || DEFAULT_PLAYER_SIZE) : DEFAULT_PLAYER_SIZE;
            const h = useRealSize ? (instance.height || DEFAULT_PLAYER_SIZE) : DEFAULT_PLAYER_SIZE;
            const sizeStyle = { width: w, height: h };

            if (instance.player === 'astc') return (
              <AlphaVideoGpuView
                style={sizeStyle}
                source={{ uri: instance.uri }}
                memoryStrategy={ktx2MemoryStrategy}
                autoPlay
                loop
                stream={ktx2StreamEnabled}
                streamingRingSize={ktx2RingSize}
                streamingCacheSize={ktx2CacheSize}
                streamingPrefetchAhead={ktx2PrefetchAhead}
                onLoad={(e: any) => handleInstanceLoad(instance.id, e)}
              />
            );
            if (instance.player === 'ffmpegkit') return (
              <FFmpegKitAlphaView
                style={sizeStyle}
                source={{ uri: instance.uri }}
                mode={webmKitStream ? 'stream' : 'preload'}
                autoPlay
                loop
                onLoad={(e: any) => handleInstanceLoad(instance.id, e)}
              />
            );
            if (instance.player === 'cpp') return (
              <AlphaVideoView
                style={sizeStyle}
                source={{ uri: instance.uri }}
                autoPlay
                loop
                verbose={false}
                mode={webmMode}
                decoder={Platform.OS === 'android' ? webmDecoder : undefined}
                useDecodeQueue={useDecodeQueue}
                streamCacheSize={streamCacheSize}
                streamPrefetchAhead={streamPrefetchAhead}
                onLoad={(e: any) => handleInstanceLoad(instance.id, e)}
              />
            );
            if (instance.player === 'exovp9alpha') return (
              <ExoVp9AlphaView
                style={sizeStyle}
                source={{ uri: instance.uri }}
                autoPlay
                loop
              />
            );
            if (instance.player === 'apng') return (
              <AnimatedImageView
                style={sizeStyle}
                source={{ uri: instance.uri }}
                autoPlay
                loop
              />
            );
            if (instance.player === 'avif') return (
              <AnimatedImageView
                style={sizeStyle}
                source={{ uri: instance.uri }}
                autoPlay
                loop
              />
            );
            return <View style={sizeStyle} />;
          })()}
        </DraggableContainer>
      ))}

      {showSettings && <View style={[styles.settingsColumn, { top: insets.top + 70 }]}>
        {/* KTX2/ASTC Settings Panel */}
        <View style={[styles.streamingPanel, { borderColor: PLAYER_BY_ID.astc.color }]}>
          <Text style={styles.streamingTitle}>ASTC (alpha-video-gpu)</Text>
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

        {/* WebM FFmpegKit Settings Panel */}
        <View style={[styles.streamingPanel, { borderColor: PLAYER_BY_ID.ffmpegkit.color }]}>
          <Text style={styles.streamingTitle}>WebM FFmpegKit</Text>
          <View style={styles.streamingRow}>
            <Text style={styles.streamingLabel}>Stream</Text>
            <Switch
              value={webmKitStream}
              onValueChange={setWebmKitStream}
              trackColor={{ false: '#555', true: '#4a9' }}
              thumbColor={webmKitStream ? '#fff' : '#888'}
            />
          </View>
        </View>

        {/* WebM C++ Settings Panel */}
        <View style={[styles.streamingPanel, { borderColor: PLAYER_BY_ID.cpp.color }]}>
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
          {Platform.OS === 'android' && (
            <View style={styles.streamingRow}>
              <Text style={styles.streamingLabel}>Dec</Text>
              <View style={styles.decoderButtons}>
                {DECODER_OPTIONS.map(([value, label]) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.decoderBtn, webmDecoder === value && styles.modeBtnActive]}
                    onPress={() => setWebmDecoder(value)}
                  >
                    <Text style={[styles.modeBtnText, webmDecoder === value && styles.modeBtnTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {Platform.OS === 'ios' && (
            <View style={styles.streamingRow}>
              <Text style={styles.streamingLabel}>Dec</Text>
              <View style={[styles.modeBtn, styles.modeBtnActive]}>
                <Text style={[styles.modeBtnText, styles.modeBtnTextActive]}>software</Text>
              </View>
            </View>
          )}
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
        </View>
      </View>}

      {/* Spawn controls stacked on the metrics panel, so neither overlaps the other */}
      <View style={[styles.bottomDock, { paddingBottom: insets.bottom }]}>
        <SpawnControls
          selections={selections}
          onSpawn={spawn}
          onSpawnExoVp9Alpha={Platform.OS === 'android' ? spawnExoVp9Alpha : undefined}
          onClearAll={clearAll}
        />
        <PerformancePanel metrics={metrics} counts={counts} />
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
  bottomDock: {
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
  settingsColumn: {
    position: 'absolute',
    right: 8,
    alignItems: 'flex-end',
    zIndex: 1001,
  },
  streamingPanel: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: 8,
    marginBottom: 6,
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
  // Five buttons wrap onto two lines so the panel keeps the Mode row's width
  decoderButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flexShrink: 1,
    maxWidth: 150,
  },
  decoderBtn: {
    backgroundColor: '#555',
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginLeft: 4,
    marginVertical: 2,
    borderRadius: 4,
  },
  modeBtnText: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: 'bold',
  },
  modeBtnTextActive: {
    color: '#fff',
  },
  settingsColumnLeft: {
    position: 'absolute',
    left: 8,
    alignItems: 'flex-start',
    zIndex: 1001,
  },
  assetSelector: {
    width: 172,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 5,
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
  },
});

export default App;
