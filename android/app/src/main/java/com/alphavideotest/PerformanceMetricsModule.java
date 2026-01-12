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

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.RandomAccessFile;

public class PerformanceMetricsModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    
    // For tracking CPU usage between calls
    private long lastCpuTime = 0;
    private long lastAppCpuTime = 0;

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

            // Get CPU usage - REAL app CPU usage from /proc/self/stat
            float[] cpuResult = getCpuUsage();
            metrics.putDouble("cpuUsage", cpuResult[0]);
            metrics.putBoolean("isRealCpuUsage", cpuResult[1] == 1);

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
     * Get REAL CPU usage for this app from /proc/self/stat
     * Returns: [cpuUsage, isRealCpuUsage]
     * isRealCpuUsage: 1 = real from /proc/self/stat, 0 = not available
     */
    private float[] getCpuUsage() {
        float[] result = new float[]{0, 0};
        
        try {
            // Read app's CPU time from /proc/self/stat (always accessible)
            RandomAccessFile reader = new RandomAccessFile("/proc/self/stat", "r");
            String line = reader.readLine();
            reader.close();
            
            // /proc/self/stat format: pid (comm) state utime stime cutime cstime ...
            // Find the closing parenthesis of comm field (can contain spaces)
            int commEnd = line.indexOf(") ");
            if (commEnd < 0) {
                return result; // Invalid format
            }
            String afterComm = line.substring(commEnd + 2);
            String[] fields = afterComm.split(" ");
            
            // After (comm), fields are: state(0) ppid(1) pgrp(2) session(3) tty_nr(4) 
            // tpgid(5) flags(6) minflt(7) cminflt(8) majflt(9) cmajflt(10) 
            // utime(11) stime(12) cutime(13) cstime(14) ...
            if (fields.length < 13) {
                return result; // Not enough fields
            }
            
            long utime = Long.parseLong(fields[11]);
            long stime = Long.parseLong(fields[12]);
            long appCpuTime = utime + stime;
            
            // Get elapsed time in clock ticks
            long currentTimeMs = System.currentTimeMillis();
            
            // Calculate CPU usage since last call
            if (lastCpuTime > 0) {
                long timeDeltaMs = currentTimeMs - lastCpuTime;
                long appCpuDelta = appCpuTime - lastAppCpuTime;
                
                if (timeDeltaMs > 0 && appCpuDelta >= 0) {
                    // Convert clock ticks to milliseconds (USER_HZ is typically 100, so 1 tick = 10ms)
                    long appCpuDeltaMs = appCpuDelta * 10;
                    // CPU usage as percentage
                    float usage = (float) appCpuDeltaMs / timeDeltaMs * 100;
                    result[0] = Math.max(0, Math.min(usage, 100)); // Clamp 0-100%
                    result[1] = 1; // Mark as REAL
                }
            } else {
                // First call - we have data but can't calculate delta yet
                // Mark as real but 0% (will show real value on next call)
                result[1] = 1;
            }
            
            // Store for next call
            lastCpuTime = currentTimeMs;
            lastAppCpuTime = appCpuTime;
            
        } catch (Exception e) {
            // Return 0 with isReal=0 on error
            android.util.Log.e("PerformanceMetrics", "CPU read error: " + e.getMessage());
        }
        
        return result;
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
