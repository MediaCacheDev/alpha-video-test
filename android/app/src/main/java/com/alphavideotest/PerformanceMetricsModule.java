package com.alphavideotest;

import android.app.ActivityManager;
import android.content.Context;
import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLSurface;
import android.opengl.GLES20;
import android.os.Build;
import android.os.Debug;
import android.os.Process;
import android.os.SystemClock;
import android.system.Os;
import android.system.OsConstants;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
public class PerformanceMetricsModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    
    private long lastCpuTimeMs = 0;
    private long lastWallTimeMs = 0;

    public PerformanceMetricsModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @NonNull
    @Override
    public String getName() {
        return "PerformanceMetrics";
    }

    @ReactMethod
    public void getMetrics(Promise promise) {
        try {
            WritableMap metrics = new WritableNativeMap();

            double cpuCoresBusy = getCpuCoresBusy();
            int cpuCoreCount = getCpuCoreCount();
            metrics.putDouble("cpuCoresBusy", cpuCoresBusy);
            metrics.putInt("cpuCoreCount", cpuCoreCount);
            metrics.putDouble("cpuUsage", Math.min(100, cpuCoresBusy / cpuCoreCount * 100));
            metrics.putBoolean("isRealCpuUsage", true);

            // Get memory info
            ActivityManager activityManager = (ActivityManager) reactContext.getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo memInfo = new ActivityManager.MemoryInfo();
            activityManager.getMemoryInfo(memInfo);

            // App memory usage
            Debug.MemoryInfo debugMemInfo = new Debug.MemoryInfo();
            Debug.getMemoryInfo(debugMemInfo);
            long appMemoryUsed = debugMemInfo.getTotalPss() / 1024; // MB
            metrics.putDouble("memoryUsed", appMemoryUsed);
            metrics.putDouble("memoryTotal", memInfo.totalMem / 1024 / 1024); // MB

            // GPU memory - only report REAL values, no estimation
            long[] gpuMemory = getGpuMemory();
            metrics.putDouble("gpuMemoryUsed", gpuMemory[0]); // MB (0 if unavailable)
            metrics.putDouble("gpuMemoryTotal", 0); // Not available on Android without estimation
            metrics.putBoolean("isRealGpuMemory", gpuMemory[2] == 1); // true = real from summary.graphics

            // GPU name
            String gpuName = getGpuName();
            metrics.putString("gpuName", gpuName);

            // Unified memory (most mobile GPUs share system RAM)
            metrics.putBoolean("hasUnifiedMemory", true);

            promise.resolve(metrics);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    /**
     * CPU time used by all of this app's threads since the previous call, divided by the
     * wall time between the calls. Returns the number of cores kept busy on average,
     * e.g. 1.5 = one and a half cores. Returns 0 on the first call.
     */
    private double getCpuCoresBusy() {
        long cpuTimeMs = Process.getElapsedCpuTime();
        long wallTimeMs = SystemClock.elapsedRealtime();

        double coresBusy = 0;
        if (lastWallTimeMs > 0 && wallTimeMs > lastWallTimeMs) {
            coresBusy = (double) (cpuTimeMs - lastCpuTimeMs) / (wallTimeMs - lastWallTimeMs);
        }

        lastCpuTimeMs = cpuTimeMs;
        lastWallTimeMs = wallTimeMs;
        return Math.max(0, coresBusy);
    }

    /** Configured cores, not just online ones: idle devices take cores offline. */
    private static int getCpuCoreCount() {
        long configured = Os.sysconf(OsConstants._SC_NPROCESSORS_CONF);
        return configured > 0 ? (int) configured : Runtime.getRuntime().availableProcessors();
    }

    /**
     * Get GPU memory info.
     * Returns: [gpuMemoryUsed, gpuMemoryTotal, isRealGpuMemory]
     * isRealGpuMemory: 1 = real from summary.graphics, 0 = not available
     */
    private long[] getGpuMemory() {
        // [gpuMemoryUsed, gpuMemoryTotal, isRealGpuMemory]
        long[] result = new long[]{0, 0, 0};
        
        try {
            // Use graphics memory from MemoryInfo if available (API 23+)
            // This is the ONLY real GPU memory metric on Android
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Debug.MemoryInfo memInfo = new Debug.MemoryInfo();
                Debug.getMemoryInfo(memInfo);
                
                // getMemoryStat("summary.graphics") returns REAL graphics memory on supported devices
                String graphicsMem = memInfo.getMemoryStat("summary.graphics");
                if (graphicsMem != null) {
                    long graphicsKB = Long.parseLong(graphicsMem);
                    if (graphicsKB > 0) {
                        result[0] = graphicsKB / 1024; // KB to MB
                        result[2] = 1; // Mark as REAL GPU memory
                    }
                }
                // If summary.graphics is null or 0, we leave result[0] as 0 and result[2] as 0
                // NO ESTIMATION - we only report what we can actually measure
            }
            // For API < 23 or if summary.graphics unavailable, result stays [0, 0, 0]
            // This clearly indicates GPU memory is not available on this device
            
        } catch (Exception e) {
            // Return zeros on error - no estimation
        }
        
        return result;
    }

    private String getGpuName() {
        // Try to get GPU renderer name via EGL
        try {
            EGLDisplay display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
            int[] version = new int[2];
            EGL14.eglInitialize(display, version, 0, version, 1);

            int[] configAttribs = {
                EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
                EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT,
                EGL14.EGL_NONE
            };
            EGLConfig[] configs = new EGLConfig[1];
            int[] numConfigs = new int[1];
            EGL14.eglChooseConfig(display, configAttribs, 0, configs, 0, 1, numConfigs, 0);

            int[] contextAttribs = {
                EGL14.EGL_CONTEXT_CLIENT_VERSION, 2,
                EGL14.EGL_NONE
            };
            EGLContext context = EGL14.eglCreateContext(display, configs[0], EGL14.EGL_NO_CONTEXT, contextAttribs, 0);

            int[] surfaceAttribs = {
                EGL14.EGL_WIDTH, 1,
                EGL14.EGL_HEIGHT, 1,
                EGL14.EGL_NONE
            };
            EGLSurface surface = EGL14.eglCreatePbufferSurface(display, configs[0], surfaceAttribs, 0);

            EGL14.eglMakeCurrent(display, surface, surface, context);

            String renderer = GLES20.glGetString(GLES20.GL_RENDERER);
            String vendor = GLES20.glGetString(GLES20.GL_VENDOR);

            EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT);
            EGL14.eglDestroySurface(display, surface);
            EGL14.eglDestroyContext(display, context);
            EGL14.eglTerminate(display);

            return vendor + " " + renderer;
        } catch (Exception e) {
            return "Unknown GPU";
        }
    }
}
