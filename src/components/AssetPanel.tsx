import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  CLIPS,
  PLAYERS,
  hasClip,
  variantFor,
  type ClipId,
  type Player,
  type PlayerId,
} from '../catalog';

const CLIP_COLOR = '#4a9';

interface ClipRowProps {
  clip: ClipId;
  onSelect: (clip: ClipId) => void;
}

/** The clip every spawn button plays */
export const ClipRow: React.FC<ClipRowProps> = ({ clip, onSelect }) => (
  <View style={styles.row}>
    {CLIPS.map(c => (
      <Option
        key={c.id}
        label={c.label}
        color={CLIP_COLOR}
        selected={clip === c.id}
        disabled={!hasClip(c.id)}
        onPress={() => onSelect(c.id)}
      />
    ))}
  </View>
);

interface AssetPanelProps {
  clip: ClipId;
  variants: Record<PlayerId, string>;
  onSelectVariant: (player: PlayerId, variant: string) => void;
}

/** The variant each spawn button plays, for the players that read more than one, in the player's colour */
export const AssetPanel: React.FC<AssetPanelProps> = ({ clip, variants, onSelectVariant }) => (
  <View style={styles.panel}>
    {PLAYERS.filter(player => player.variants.length > 1).map(player => (
      <VariantSection
        key={player.id}
        player={player}
        selected={variantFor(player, clip, variants[player.id])?.id}
        clip={clip}
        onSelect={variant => onSelectVariant(player.id, variant)}
      />
    ))}
    <Text style={styles.legend}>
      {CLIPS.map(c => `${c.label} ${c.detail}`).join(', ')}{'\n'}
      S: alpha inside the VP8 or VP9 stream{'\n'}
      D: dual stream, alpha in its own track{'\n'}
      Raw: uncompressed ASTC{'\n'}
      Greyed out: not in assets/media
    </Text>
  </View>
);

const PER_ROW = 3;

interface VariantSectionProps {
  player: Player;
  selected: string | undefined;
  clip: ClipId;
  onSelect: (variant: string) => void;
}

const VariantSection: React.FC<VariantSectionProps> = ({ player, selected, clip, onSelect }) => {
  const rows = [];
  for (let i = 0; i < player.variants.length; i += PER_ROW) rows.push(player.variants.slice(i, i + PER_ROW));
  return (
    <View style={[styles.section, { borderColor: player.color }]}>
      <Text style={[styles.title, { color: player.color }]}>{player.title}</Text>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map(variant => (
            <Option
              key={variant.id}
              label={variant.label}
              color={player.color}
              selected={selected === variant.id}
              disabled={!variant.files[clip]}
              onPress={() => onSelect(variant.id)}
            />
          ))}
          {/* Keeps a short last row's buttons as wide as the full rows' */}
          {Array.from({ length: PER_ROW - row.length }, (_, j) => <View key={`gap${j}`} style={styles.gap} />)}
        </View>
      ))}
    </View>
  );
};

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
  gap: {
    flex: 1,
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
