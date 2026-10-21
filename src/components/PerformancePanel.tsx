import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PerformanceMetrics } from '../hooks/usePerformanceMetrics';
import { PLAYERS, type PlayerId } from '../catalog';

interface PerformancePanelProps {
  metrics: PerformanceMetrics;
  /** Players on screen, by player */
  counts: Partial<Record<PlayerId, number>>;
}

export const PerformancePanel: React.FC<PerformancePanelProps> = ({ metrics, counts }) => {
  const getFpsColor = (fps: number) => {
    if (fps >= 55) return '#4CAF50';
    if (fps >= 30) return '#FFC107';
    return '#F44336';
  };

  const getCpuColor = (cpuPercentOfDevice: number) => {
    if (cpuPercentOfDevice <= 50) return '#4CAF50';
    if (cpuPercentOfDevice <= 80) return '#FFC107';
    return '#F44336';
  };

  return (
    <View style={styles.container}>
      {/* GPU Info Row */}
      <View style={styles.gpuRow}>
        <Text style={styles.gpuName}>{metrics.gpuName}</Text>
      </View>

      {/* Main Metrics Row */}
      <View style={styles.row}>
        <View style={styles.metric}>
          <Text style={styles.label}>FPS</Text>
          <Text style={[styles.value, { color: getFpsColor(metrics.fps) }]}>
            {metrics.fps}
          </Text>
        </View>
        
        <View style={styles.metric}>
          <Text style={styles.label}>Frame</Text>
          <Text style={styles.value}>{metrics.frameTime}ms</Text>
        </View>

        <View style={styles.metric}>
          <Text style={styles.label}>
            {metrics.isRealCpuUsage ? 'CPU' : 'CPU (N/A)'}
          </Text>
          <Text style={[styles.value, { color: metrics.isRealCpuUsage ? getCpuColor(metrics.cpuUsage) : '#666' }]}>
            {metrics.isRealCpuUsage ? `${metrics.cpuUsage}%` : '—'}
          </Text>
          {metrics.isRealCpuUsage && metrics.cpuCoreCount > 0 && (
            <Text style={styles.subValue}>
              {metrics.cpuCoresBusy.toFixed(1)} / {metrics.cpuCoreCount} cores
            </Text>
          )}
        </View>

        <View style={styles.metric}>
          <Text style={styles.label}>RAM</Text>
          <Text style={styles.value}>
            {metrics.memoryUsed}MB
          </Text>
        </View>

        <View style={styles.metric}>
          <Text style={styles.label}>
            {metrics.isRealGpuMemory ? 'GPU Mem' : 'GPU Mem (N/A)'}
          </Text>
          <Text style={[styles.value, { color: metrics.isRealGpuMemory ? '#4CAF50' : '#666' }]}>
            {metrics.isRealGpuMemory ? `${metrics.gpuMemoryUsed}MB` : '—'}
          </Text>
        </View>
      </View>

      {/* Players running, in their spawn buttons' colours */}
      <View style={[styles.row, styles.badges]}>
        {PLAYERS.map(player => (
          <View key={player.id} style={[styles.countBadge, { backgroundColor: player.color }]}>
            <Text style={styles.countText}>
              {player.tag}: {counts[player.id] ?? 0}
            </Text>
          </View>
        ))}
        <View style={[styles.countBadge, { backgroundColor: '#607D8B' }]}>
          <Text style={styles.countText}>
            Total: {Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: 4,
  },
  metric: {
    alignItems: 'center',
    minWidth: 70,
  },
  label: {
    color: '#888',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  value: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  subValue: {
    color: '#888',
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  badges: {
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginHorizontal: 2,
  },
  countText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  gpuRow: {
    alignItems: 'center',
    marginBottom: 6,
  },
  gpuName: {
    color: '#FF9800',
    fontSize: 11,
    fontWeight: '600',
  },
});
