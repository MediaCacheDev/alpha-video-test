import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  CLIPS,
  PLAYERS,
  fileFor,
  hasClip,
  selectClip,
  type Player,
  type PlayerId,
  type Selection,
} from '../catalog';

interface AssetPanelProps {
  selections: Record<PlayerId, Selection>;
  onSelect: (player: PlayerId, selection: Selection) => void;
}

/** What each spawn button plays next: one section per player, in the player's colour */
export const AssetPanel: React.FC<AssetPanelProps> = ({ selections, onSelect }) => (
  <View style={styles.panel}>
    {PLAYERS.map(player => (
      <PlayerSection
        key={player.id}
        player={player}
        selection={selections[player.id]}
        onSelect={selection => onSelect(player.id, selection)}
      />
    ))}
    <Text style={styles.legend}>
      {CLIPS.map(clip => `${clip.label} ${clip.detail}`).join(', ')}{'\n'}
      S: alpha inside the VP9 stream{'\n'}
      D: dual stream, alpha in its own track{'\n'}
      Raw: uncompressed ASTC{'\n'}
      Greyed out: not in assets/media
    </Text>
  </View>
);

interface PlayerSectionProps {
  player: Player;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

const PlayerSection: React.FC<PlayerSectionProps> = ({ player, selection, onSelect }) => (
  <View style={[styles.section, { borderColor: player.color }]}>
    <Text style={[styles.title, { color: player.color }]}>{player.title}</Text>
    <View style={styles.row}>
      {CLIPS.map(clip => (
        <Option
          key={clip.id}
          label={clip.label}
          color={player.color}
          selected={selection.clip === clip.id}
          disabled={!hasClip(player, clip.id)}
          onPress={() => onSelect(selectClip(player, selection, clip.id))}
        />
      ))}
    </View>
    {player.variants.length > 1 && (
      <View style={styles.row}>
        {player.variants.map(variant => (
          <Option
            key={variant.id}
            label={variant.label}
            color={player.color}
            selected={selection.variant === variant.id}
            disabled={!fileFor(player, { clip: selection.clip, variant: variant.id })}
            onPress={() => onSelect({ clip: selection.clip, variant: variant.id })}
          />
        ))}
      </View>
    )}
  </View>
);

interface OptionProps {
  label: string;
  color: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}

const Option: React.FC<OptionProps> = ({ label, color, selected, disabled, onPress }) => (
  <TouchableOpacity
    style={[styles.option, selected && { backgroundColor: color }, disabled && styles.optionDisabled]}
    onPress={onPress}
    disabled={disabled}
  >
    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  panel: {
    width: 172,
  },
  section: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginBottom: 5,
  },
  title: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 3,
  },
  row: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 2,
  },
  option: {
    flex: 1,
    backgroundColor: '#444',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    alignItems: 'center',
  },
  optionDisabled: {
    opacity: 0.3,
  },
  optionText: {
    color: '#bbb',
    fontSize: 11,
    fontWeight: 'bold',
  },
  optionTextSelected: {
    color: '#fff',
  },
  legend: {
    color: '#bbb',
    fontSize: 9,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 6,
    padding: 5,
    marginBottom: 5,
  },
});
