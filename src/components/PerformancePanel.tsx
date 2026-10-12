import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PerformanceMetrics } from '../hooks/usePerformanceMetrics';

interface PerformancePanelProps {
  metrics: PerformanceMetrics;
}

export const PerformancePanel: React.FC<PerformancePanelProps> = ({ metrics }) => {
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

      {/* Instance Count Row 1 - KTX2 variants */}
      <View style={styles.row}>
        <View style={[styles.countBadge, { backgroundColor: '#4CAF50' }]}>
          <Text style={styles.countText}>
            ASTC: {metrics.instanceCount.ktx2}
          </Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: '#8BC34A' }]}>
          <Text style={styles.countText}>
            ZST: {metrics.instanceCount.ktx2zst}
          </Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: '#CDDC39' }]}>
          <Text style={[styles.countText, { color: '#333' }]}>
            Raw: {metrics.instanceCount.ktx2raw}
          </Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: '#607D8B' }]}>
          <Text style={styles.countText}>
            Total: {metrics.instanceCount.ktx2 + metrics.instanceCount.ktx2zst + metrics.instanceCount.ktx2raw + metrics.instanceCount.webm + metrics.instanceCount.webmcpp + metrics.instanceCount.apng + metrics.instanceCount.avif}
          </Text>
        </View>
      </View>
      {/* Instance Count Row 2 - Other formats */}
      <View style={styles.row}>
        <View style={[styles.countBadge, { backgroundColor: '#2196F3' }]}>
          <Text style={styles.countText}>
            WebM: {metrics.instanceCount.webm}
          </Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: '#00BCD4' }]}>
          <Text style={styles.countText}>
            C++: {metrics.instanceCount.webmcpp}
          </Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: '#9C27B0' }]}>
          <Text style={styles.countText}>
            APNG: {metrics.instanceCount.apng}
          </Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: '#FF5722' }]}>
          <Text style={styles.countText}>
            AVIF: {metrics.instanceCount.avif}
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
    marginBottom: 4,
  },
  gpuName: {
    color: '#FF9800',
    fontSize: 11,
    fontWeight: '600',
  },
});
