import { useState, useEffect, useRef, useCallback } from 'react';
import { NativeModules, Platform } from 'react-native';

// React Native provides performance API globally
declare const performance: { now: () => number; memory?: any };

// Native module for performance metrics
const { PerformanceMetrics: NativePerformanceMetrics } = NativeModules;

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsed: number;
  memoryTotal: number;
  cpuUsage: number; // share of the whole device, 0-100
  cpuCoresBusy: number; // app CPU time / wall time, e.g. 1.5 = one and a half cores
  cpuCoreCount: number;
  isRealCpuUsage: boolean; // true = real CPU usage from kernel API, false = not available
  gpuMemoryUsed: number;
  gpuMemoryTotal: number;
  gpuName: string;
  isRealGpuMemory: boolean; // true = real GPU memory from Metal/Android API, false = not available
  instanceCount: { ktx2: number; ktx2zst: number; ktx2raw: number; webm: number; webmcpp: number; apng: number; avif: number };
}

export const usePerformanceMetrics = (ktx2Count: number, ktx2ZstCount: number = 0, ktx2RawCount: number = 0, webmCount: number = 0, webmCppCount: number = 0, apngCount: number = 0, avifCount: number = 0) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    frameTime: 0,
    memoryUsed: 0,
    memoryTotal: 0,
    cpuUsage: 0,
    cpuCoresBusy: 0,
    cpuCoreCount: 0,
    isRealCpuUsage: false,
    gpuMemoryUsed: 0,
    gpuMemoryTotal: 0,
    gpuName: 'Loading...',
    isRealGpuMemory: false,
    instanceCount: { ktx2: 0, ktx2zst: 0, ktx2raw: 0, webm: 0, webmcpp: 0, apng: 0, avif: 0 },
  });

  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const animationFrameRef = useRef<number | null>(null);

  const measureFrame = useCallback(() => {
    const now = performance.now();
    const frameTime = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;

    frameTimesRef.current.push(frameTime);
    if (frameTimesRef.current.length > 60) {
      frameTimesRef.current.shift();
    }

    animationFrameRef.current = requestAnimationFrame(measureFrame);
  }, []);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(measureFrame);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [measureFrame]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const frameTimes = frameTimesRef.current;
      if (frameTimes.length > 0) {
        const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        const fps = Math.round(1000 / avgFrameTime);

        // Get native metrics (CPU, memory, GPU)
        let nativeMetrics: any = {};
        
        if (Platform.OS !== 'web' && NativePerformanceMetrics) {
          try {
            nativeMetrics = await NativePerformanceMetrics.getMetrics();
          } catch (e) {
            console.warn('Failed to get native metrics:', e);
          }
        } else if (Platform.OS === 'web') {
          // Web fallback - use performance.memory if available
          if (typeof (performance as any).memory !== 'undefined') {
            const memory = (performance as any).memory;
            nativeMetrics.memoryUsed = Math.round(memory.usedJSHeapSize / 1024 / 1024);
            nativeMetrics.memoryTotal = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
          }
          // CPU estimation for web
          const targetFrameTime = 16.67;
          nativeMetrics.cpuUsage = Math.min(100, Math.round((avgFrameTime / targetFrameTime) * 100));
          nativeMetrics.gpuName = 'WebGL';
          nativeMetrics.gpuMemoryUsed = 0;
          nativeMetrics.gpuMemoryTotal = 0;
        }

        setMetrics({
          fps,
          frameTime: Math.round(avgFrameTime * 100) / 100,
          memoryUsed: nativeMetrics.memoryUsed || 0,
          memoryTotal: nativeMetrics.memoryTotal || 0,
          cpuUsage: Math.round(nativeMetrics.cpuUsage || 0),
          cpuCoresBusy: nativeMetrics.cpuCoresBusy || 0,
          cpuCoreCount: nativeMetrics.cpuCoreCount || 0,
          isRealCpuUsage: nativeMetrics.isRealCpuUsage === true,
          gpuMemoryUsed: nativeMetrics.gpuMemoryUsed || 0,
          gpuMemoryTotal: nativeMetrics.gpuMemoryTotal || 0,
          gpuName: nativeMetrics.gpuName || 'Unknown',
          isRealGpuMemory: nativeMetrics.isRealGpuMemory === true,
          instanceCount: { ktx2: ktx2Count, ktx2zst: ktx2ZstCount, ktx2raw: ktx2RawCount, webm: webmCount, webmcpp: webmCppCount, apng: apngCount, avif: avifCount },
        });
      }
    }, 500);

    return () => clearInterval(interval);
  }, [ktx2Count, ktx2ZstCount, ktx2RawCount, webmCount, webmCppCount, apngCount, avifCount]);

  return metrics;
};
