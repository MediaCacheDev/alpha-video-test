import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface SpawnControlsProps {
  onSpawnKTX2: () => void;
  onSpawnKTX2Stream?: () => void;
  onSpawnKTX2Uncompressed?: () => void;
  onSpawnWebM: () => void;
  onSpawnWebMCpp?: () => void;
  onSpawnApng?: () => void;
  onSpawnAvif?: () => void;
  onClearAll: () => void;
}

export const SpawnControls: React.FC<SpawnControlsProps> = ({
  onSpawnKTX2,
  onSpawnKTX2Stream,
  onSpawnKTX2Uncompressed,
  onSpawnWebM,
  onSpawnWebMCpp,
  onSpawnApng,
  onSpawnAvif,
  onClearAll,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, styles.ktx2Button]}
        onPress={onSpawnKTX2}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>+ ASTC</Text>
        <Text style={styles.subText}>GPU Texture</Text>
      </TouchableOpacity>

      {onSpawnKTX2Stream && (
        <TouchableOpacity
          style={[styles.button, styles.ktx2StreamButton]}
          onPress={onSpawnKTX2Stream}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>+ Stream</Text>
          <Text style={styles.subText}>KTX2 Zstd</Text>
        </TouchableOpacity>
      )}

      {onSpawnKTX2Uncompressed && (
        <TouchableOpacity
          style={[styles.button, styles.ktx2UncompressedButton]}
          onPress={onSpawnKTX2Uncompressed}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>+ Raw</Text>
          <Text style={styles.subText}>Uncompressed</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.button, styles.webmButton]}
        onPress={onSpawnWebM}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>+ WebM</Text>
        <Text style={styles.subText}>FFmpegKit</Text>
      </TouchableOpacity>

      {onSpawnWebMCpp && (
        <TouchableOpacity
          style={[styles.button, styles.webmCppButton]}
          onPress={onSpawnWebMCpp}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>+ WebM</Text>
          <Text style={styles.subText}>C++ FFmpeg</Text>
        </TouchableOpacity>
      )}

      {onSpawnApng && (
        <TouchableOpacity
          style={[styles.button, styles.apngButton]}
          onPress={onSpawnApng}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>+ APNG</Text>
          <Text style={styles.subText}>Animated PNG</Text>
        </TouchableOpacity>
      )}

      {onSpawnAvif && (
        <TouchableOpacity
          style={[styles.button, styles.avifButton]}
          onPress={onSpawnAvif}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>+ AVIF</Text>
          <Text style={styles.subText}>AV1 Image</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.button, styles.clearButton]}
        onPress={onClearAll}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>Clear</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    gap: 4,
  },
  button: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 5,
    alignItems: 'center',
    minWidth: 50,
  },
  ktx2Button: {
    backgroundColor: '#4CAF50',
  },
  ktx2StreamButton: {
    backgroundColor: '#8BC34A',
  },
  ktx2UncompressedButton: {
    backgroundColor: '#CDDC39',
  },
  webmButton: {
    backgroundColor: '#2196F3',
  },
  webmCppButton: {
    backgroundColor: '#00BCD4',
  },
  apngButton: {
    backgroundColor: '#9C27B0',
  },
  avifButton: {
    backgroundColor: '#FF5722',
  },
  clearButton: {
    backgroundColor: '#F44336',
  },
  buttonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  subText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 7,
    marginTop: 0,
  },
});
