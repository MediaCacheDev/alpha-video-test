import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { PLAYERS, type PlayerId } from '../catalog';

interface SpawnControlsProps {
  /** Whether the player has a file of the picked clip; a button without one is greyed out */
  canSpawn: (player: PlayerId) => boolean;
  /** Spawns a player with the picked clip and its picked variant */
  onSpawn: (player: PlayerId) => void;
  onSpawnExoVp9Alpha?: () => void;
  onClearAll: () => void;
}

export const SpawnControls: React.FC<SpawnControlsProps> = ({
  canSpawn,
  onSpawn,
  onSpawnExoVp9Alpha,
  onClearAll,
}) => {
  return (
    <View style={styles.container}>
      {PLAYERS.map(player => (
        <TouchableOpacity
          key={player.id}
          style={[styles.button, { backgroundColor: player.color }, !canSpawn(player.id) && styles.disabled]}
          onPress={() => onSpawn(player.id)}
          disabled={!canSpawn(player.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>{player.button}</Text>
          <Text style={styles.subText}>{player.buttonDetail}</Text>
        </TouchableOpacity>
      ))}

      {onSpawnExoVp9Alpha && (
        <TouchableOpacity
          style={[styles.button, styles.exoVp9AlphaButton, !canSpawn('ffmpegkit') && styles.disabled]}
          onPress={onSpawnExoVp9Alpha}
          disabled={!canSpawn('ffmpegkit')}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>+ ExoPlayer</Text>
          <Text style={styles.subText}>VP9 Alpha</Text>
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
  disabled: {
    opacity: 0.3,
  },
  exoVp9AlphaButton: {
    backgroundColor: '#FF9800',
    borderWidth: 1,
    borderColor: '#FFB74D',
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
