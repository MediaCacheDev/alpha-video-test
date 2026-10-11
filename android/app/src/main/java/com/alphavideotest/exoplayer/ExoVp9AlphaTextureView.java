/**
 * ExoPlayer-style VP9 Alpha TextureView for React Native.
 *
 * This view uses FFmpeg's demuxer (via native code) to properly decode VP9 WebM
 * videos with alpha transparency. ExoPlayer's WebM demuxer doesn't extract the
 * BlockAdditional alpha data, so we use FFmpeg for demuxing instead.
 *
 * The rendering uses OpenGL ES with a YUVA-to-RGBA shader for alpha compositing.
 */
package com.alphavideotest.exoplayer;

import android.content.Context;
import android.graphics.SurfaceTexture;
import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLSurface;
import android.opengl.GLES20;
import android.util.AttributeSet;
import android.util.Log;
import android.view.TextureView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * VP9 Alpha TextureView using FFmpeg demuxer for proper WebM alpha support.
 * 
 * This is NOT using ExoPlayer's demuxer because it doesn't extract BlockAdditional
 * alpha data from WebM files. Instead, we use FFmpeg to demux and decode, which
 * properly extracts the alpha plane.
 */
public class ExoVp9AlphaTextureView extends TextureView 
        implements TextureView.SurfaceTextureListener {

    private static final String TAG = "ExoVp9AlphaView";

    // Vertex shader - passes through position and texture coordinates
    private static final String VERTEX_SHADER =
        "attribute vec4 aPosition;\n" +
        "attribute vec2 aTexCoord;\n" +
        "varying vec2 vTexCoord;\n" +
        "void main() {\n" +
        "    gl_Position = aPosition;\n" +
        "    vTexCoord = aTexCoord;\n" +
        "}\n";

    // Fragment shader - converts YUVA to RGBA with premultiplied alpha
    private static final String FRAGMENT_SHADER =
        "precision mediump float;\n" +
        "varying vec2 vTexCoord;\n" +
        "uniform sampler2D yTexture;\n" +
        "uniform sampler2D uTexture;\n" +
        "uniform sampler2D vTexture;\n" +
        "uniform sampler2D aTexture;\n" +
        "void main() {\n" +
        "    float y = texture2D(yTexture, vTexCoord).r;\n" +
        "    float u = texture2D(uTexture, vTexCoord).r - 0.5;\n" +
        "    float v = texture2D(vTexture, vTexCoord).r - 0.5;\n" +
        "    float a = texture2D(aTexture, vTexCoord).r;\n" +
        "    float r = clamp(y + 1.402 * v, 0.0, 1.0);\n" +
        "    float g = clamp(y - 0.344136 * u - 0.714136 * v, 0.0, 1.0);\n" +
        "    float b = clamp(y + 1.772 * u, 0.0, 1.0);\n" +
        "    gl_FragColor = vec4(r * a, g * a, b * a, a);\n" +
        "}\n";

    // EGL resources
    private EGLDisplay eglDisplay;
    private EGLContext eglContext;
    private EGLSurface eglSurface;
    private EGLConfig eglConfig;

    // OpenGL resources
    private int programId;
    private int[] textures = new int[4];
    private FloatBuffer vertexBuffer;
    private int currentWidth, currentHeight;

    // Surface state
    private SurfaceTexture surfaceTexture;
    private final AtomicBoolean surfaceAvailable = new AtomicBoolean(false);
    private int surfaceWidth, surfaceHeight;

    // Frame data lock
    private final Object frameDataLock = new Object();
    private ByteBuffer pendingY, pendingU, pendingV, pendingA;
    private int pendingWidth, pendingHeight;
    private volatile boolean hasNewFrame = false;

    // Native player handle
    private long nativeHandle = 0;
    private volatile boolean isReleased = false;

    // Render thread
    private ExecutorService renderThread;
    private final AtomicBoolean renderPending = new AtomicBoolean(false);

    // Load executor
    private ExecutorService loadExecutor;

    // Configuration
    private boolean autoplay = true;
    private boolean loop = true;
    private String pendingSourcePath = null;
    private boolean pendingSourceIsUrl = false;

    // Callback
    private PlayerCallback callback;

    public interface PlayerCallback {
        void onLoad(int totalFrames, int width, int height);
        void onError(String error);
    }

    // Native library loading
    private static boolean libraryLoaded = false;
    private static String libraryError = null;

    static {
        try {
            System.loadLibrary("exovp9alpha");
            libraryLoaded = true;
            Log.i(TAG, "Loaded exovp9alpha native library");
        } catch (UnsatisfiedLinkError e) {
            libraryError = e.getMessage();
            Log.e(TAG, "Failed to load native library: " + libraryError);
        }
    }

    // Native player listener interface (called from JNI)
    private final NativePlayerListener nativeListener = new NativePlayerListener() {
        @Override
        public void onLoad(int totalFrames, int width, int height) {
            Log.i(TAG, "Native onLoad: " + totalFrames + " frames, " + width + "x" + height);
            if (callback != null) {
                post(() -> callback.onLoad(totalFrames, width, height));
            }
            if (autoplay) {
                post(() -> play());
            }
        }

        @Override
        public void onFrame(int frameIndex, ByteBuffer yPlane, ByteBuffer uPlane,
                           ByteBuffer vPlane, ByteBuffer aPlane, int width, int height) {
            if (isReleased) return;
            
            synchronized (frameDataLock) {
                pendingY = yPlane;
                pendingU = uPlane;
                pendingV = vPlane;
                pendingA = aPlane;
                pendingWidth = width;
                pendingHeight = height;
                hasNewFrame = true;
            }
            requestRender();
        }

        @Override
        public void onPlay() {
            Log.d(TAG, "Native onPlay");
        }

        @Override
        public void onPause() {
            Log.d(TAG, "Native onPause");
        }

        @Override
        public void onStop() {
            Log.d(TAG, "Native onStop");
        }

        @Override
        public void onLoop() {
            Log.d(TAG, "Native onLoop");
        }

        @Override
        public void onEnd() {
            Log.d(TAG, "Native onEnd");
            if (loop && !isReleased && nativeHandle != 0) {
                // Native player handles looping
            }
        }

        @Override
        public void onError(String error) {
            Log.e(TAG, "Native error: " + error);
            if (callback != null) {
                post(() -> callback.onError(error));
            }
        }
    };

    // Native listener interface (matches JNI callback methods)
    public interface NativePlayerListener {
        void onLoad(int totalFrames, int width, int height);
        void onFrame(int frameIndex, ByteBuffer yPlane, ByteBuffer uPlane,
                    ByteBuffer vPlane, ByteBuffer aPlane, int width, int height);
        void onPlay();
        void onPause();
        void onStop();
        void onLoop();
        void onEnd();
        void onError(String error);
    }

    public ExoVp9AlphaTextureView(Context context) {
        super(context);
        init();
    }

    public ExoVp9AlphaTextureView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        if (!libraryLoaded) {
            Log.e(TAG, "Native library not loaded: " + libraryError);
            return;
        }

        setSurfaceTextureListener(this);
        setOpaque(false);

        renderThread = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "ExoVp9GLRender");
            t.setPriority(Thread.MAX_PRIORITY);
            return t;
        });

        loadExecutor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "ExoVp9Load");
            t.setPriority(Thread.NORM_PRIORITY);
            return t;
        });

        Log.i(TAG, "ExoVp9AlphaTextureView initialized");
        Log.i(TAG, "  FFmpeg: " + nativeGetFFmpegVersion());
    }

    public void setCallback(PlayerCallback callback) {
        this.callback = callback;
    }

    public void setAutoplay(boolean autoplay) {
        this.autoplay = autoplay;
    }

    public void setLoop(boolean loop) {
        this.loop = loop;
    }

    public void loadFromUrl(String url) {
        pendingSourcePath = url;
        pendingSourceIsUrl = true;

        if (!libraryLoaded || isReleased) {
            Log.w(TAG, "Cannot load - library not loaded or released");
            return;
        }

        // Download to cache first
        loadExecutor.execute(() -> {
            try {
                File cacheFile = downloadToCache(url);
                if (cacheFile != null && !isReleased) {
                    loadFromFileInternal(cacheFile.getAbsolutePath());
                }
            } catch (Exception e) {
                Log.e(TAG, "Download failed: " + e.getMessage());
                if (callback != null) {
                    post(() -> callback.onError("Download failed: " + e.getMessage()));
                }
            }
        });
    }

    public void loadFromFile(String path) {
        pendingSourcePath = path;
        pendingSourceIsUrl = false;

        if (!libraryLoaded || isReleased) {
            Log.w(TAG, "Cannot load - library not loaded or released");
            return;
        }

        loadExecutor.execute(() -> loadFromFileInternal(path));
    }

    private void loadFromFileInternal(String path) {
        if (isReleased) return;

        // Create native player if needed
        if (nativeHandle == 0) {
            nativeHandle = nativeCreate(250, loop);
            if (nativeHandle == 0) {
                Log.e(TAG, "Failed to create native player");
                if (callback != null) {
                    post(() -> callback.onError("Failed to create native decoder"));
                }
                return;
            }
            nativeSetListener(nativeHandle, nativeListener);
            Log.i(TAG, "Created native player: " + nativeHandle);
        }

        // Load the file using FFmpeg demuxer
        Log.i(TAG, "Loading file with FFmpeg demuxer: " + path);
        boolean success = nativeLoadFromFile(nativeHandle, path);
        if (!success) {
            Log.e(TAG, "Failed to load file");
            if (callback != null) {
                post(() -> callback.onError("Failed to load video file"));
            }
        }
    }

    public void play() {
        if (isReleased || nativeHandle == 0) return;
        nativePlay(nativeHandle);
    }

    public void pause() {
        if (isReleased || nativeHandle == 0) return;
        nativePause(nativeHandle);
    }

    public void stop() {
        if (isReleased || nativeHandle == 0) return;
        nativeStop(nativeHandle);
    }

    private File downloadToCache(String urlString) {
        try {
            URL url = new URL(urlString);
            String fileName = "exo_vp9alpha_" + urlString.hashCode() + ".webm";
            File cacheFile = new File(getContext().getCacheDir(), fileName);

            if (cacheFile.exists()) {
                Log.i(TAG, "Using cached file: " + cacheFile.getAbsolutePath());
                return cacheFile;
            }

            Log.i(TAG, "Downloading: " + urlString);

            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(30000);

            try (InputStream input = connection.getInputStream();
                 FileOutputStream output = new FileOutputStream(cacheFile)) {
                byte[] buffer = new byte[8192];
                int bytesRead;
                long totalBytes = 0;
                while ((bytesRead = input.read(buffer)) != -1) {
                    output.write(buffer, 0, bytesRead);
                    totalBytes += bytesRead;
                }
                Log.i(TAG, "Downloaded " + totalBytes + " bytes");
            }

            return cacheFile;

        } catch (Exception e) {
            Log.e(TAG, "Download failed: " + e.getMessage());
            return null;
        }
    }

    public void release() {
        Log.i(TAG, "Releasing player");
        isReleased = true;

        if (nativeHandle != 0) {
            final long handle = nativeHandle;
            nativeHandle = 0;
            loadExecutor.execute(() -> nativeDestroy(handle));
        }

        if (renderThread != null && !renderThread.isShutdown()) {
            renderThread.shutdown();
        }
        if (loadExecutor != null && !loadExecutor.isShutdown()) {
            loadExecutor.shutdown();
        }
    }

    // SurfaceTextureListener implementation

    @Override
    public void onSurfaceTextureAvailable(SurfaceTexture surface, int width, int height) {
        Log.i(TAG, "Surface available: " + width + "x" + height);
        this.surfaceTexture = surface;
        this.surfaceWidth = width;
        this.surfaceHeight = height;
        surfaceAvailable.set(true);

        renderThread.execute(() -> {
            initEGL();

            // Load deferred source if any
            if (pendingSourcePath != null && !isReleased) {
                if (pendingSourceIsUrl) {
                    post(() -> loadFromUrl(pendingSourcePath));
                } else {
                    loadFromFileInternal(pendingSourcePath);
                }
            }
        });
    }

    @Override
    public void onSurfaceTextureSizeChanged(SurfaceTexture surface, int width, int height) {
        this.surfaceWidth = width;
        this.surfaceHeight = height;
        renderThread.execute(() -> {
            if (eglSurface != null && eglContext != null) {
                makeCurrent();
                GLES20.glViewport(0, 0, width, height);
            }
        });
    }

    @Override
    public boolean onSurfaceTextureDestroyed(SurfaceTexture surface) {
        surfaceAvailable.set(false);
        this.surfaceTexture = null;
        renderThread.execute(this::destroyEGL);
        return true;
    }

    @Override
    public void onSurfaceTextureUpdated(SurfaceTexture surface) {
        // Nothing to do
    }

    // EGL/GL setup

    private void initEGL() {
        eglDisplay = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
        if (eglDisplay == EGL14.EGL_NO_DISPLAY) return;

        int[] version = new int[2];
        if (!EGL14.eglInitialize(eglDisplay, version, 0, version, 1)) return;

        int[] configAttribs = {
            EGL14.EGL_RED_SIZE, 8,
            EGL14.EGL_GREEN_SIZE, 8,
            EGL14.EGL_BLUE_SIZE, 8,
            EGL14.EGL_ALPHA_SIZE, 8,
            EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
            EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT,
            EGL14.EGL_NONE
        };

        EGLConfig[] configs = new EGLConfig[1];
        int[] numConfigs = new int[1];
        if (!EGL14.eglChooseConfig(eglDisplay, configAttribs, 0, configs, 0, 1, numConfigs, 0)) return;
        eglConfig = configs[0];

        int[] contextAttribs = { EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE };
        eglContext = EGL14.eglCreateContext(eglDisplay, eglConfig, EGL14.EGL_NO_CONTEXT, contextAttribs, 0);
        if (eglContext == EGL14.EGL_NO_CONTEXT) return;

        int[] surfaceAttribs = { EGL14.EGL_NONE };
        eglSurface = EGL14.eglCreateWindowSurface(eglDisplay, eglConfig, surfaceTexture, surfaceAttribs, 0);
        if (eglSurface == EGL14.EGL_NO_SURFACE) return;

        makeCurrent();
        initGL();

        Log.i(TAG, "EGL initialized");
    }

    private void destroyEGL() {
        if (eglDisplay != null) {
            EGL14.eglMakeCurrent(eglDisplay, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT);
            if (eglSurface != null) EGL14.eglDestroySurface(eglDisplay, eglSurface);
            if (eglContext != null) EGL14.eglDestroyContext(eglDisplay, eglContext);
            EGL14.eglTerminate(eglDisplay);
        }
        eglSurface = null;
        eglContext = null;
        eglDisplay = null;
        programId = 0;
        textures = new int[4];
        // Reset texture dimensions so glTexImage2D is called on new textures
        currentWidth = 0;
        currentHeight = 0;
    }

    private void makeCurrent() {
        EGL14.eglMakeCurrent(eglDisplay, eglSurface, eglSurface, eglContext);
    }

    private void initGL() {
        GLES20.glClearColor(0f, 0f, 0f, 0f);

        int vertexShader = loadShader(GLES20.GL_VERTEX_SHADER, VERTEX_SHADER);
        int fragmentShader = loadShader(GLES20.GL_FRAGMENT_SHADER, FRAGMENT_SHADER);

        programId = GLES20.glCreateProgram();
        GLES20.glAttachShader(programId, vertexShader);
        GLES20.glAttachShader(programId, fragmentShader);
        GLES20.glLinkProgram(programId);

        GLES20.glGenTextures(4, textures, 0);

        float[] vertices = {
            -1f, -1f, 0f, 1f,
             1f, -1f, 1f, 1f,
            -1f,  1f, 0f, 0f,
             1f,  1f, 1f, 0f
        };
        vertexBuffer = ByteBuffer.allocateDirect(vertices.length * 4)
            .order(ByteOrder.nativeOrder())
            .asFloatBuffer()
            .put(vertices);
        vertexBuffer.position(0);

        GLES20.glEnable(GLES20.GL_BLEND);
        GLES20.glBlendFunc(GLES20.GL_ONE, GLES20.GL_ONE_MINUS_SRC_ALPHA);
        GLES20.glViewport(0, 0, surfaceWidth, surfaceHeight);

        Log.i(TAG, "GL initialized");
    }

    private int loadShader(int type, String source) {
        int shader = GLES20.glCreateShader(type);
        GLES20.glShaderSource(shader, source);
        GLES20.glCompileShader(shader);
        return shader;
    }

    private void requestRender() {
        if (renderPending.compareAndSet(false, true)) {
            renderThread.execute(this::doRender);
        }
    }

    private void doRender() {
        renderPending.set(false);
        if (!surfaceAvailable.get() || eglSurface == null || isReleased) return;

        try {
            makeCurrent();
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);

            ByteBuffer y, u, v, a;
            int width, height;
            synchronized (frameDataLock) {
                if (!hasNewFrame || pendingY == null) {
                    EGL14.eglSwapBuffers(eglDisplay, eglSurface);
                    return;
                }
                y = pendingY;
                u = pendingU;
                v = pendingV;
                a = pendingA;
                width = pendingWidth;
                height = pendingHeight;
                hasNewFrame = false;
            }

            if (y == null || u == null || v == null || a == null) {
                EGL14.eglSwapBuffers(eglDisplay, eglSurface);
                return;
            }

            GLES20.glPixelStorei(GLES20.GL_UNPACK_ALIGNMENT, 1);

            // Y texture
            y.rewind();
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, textures[0]);
            if (currentWidth != width || currentHeight != height) {
                GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_LUMINANCE,
                    width, height, 0, GLES20.GL_LUMINANCE, GLES20.GL_UNSIGNED_BYTE, y);
                setupTexture();
            } else {
                GLES20.glTexSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0, width, height,
                    GLES20.GL_LUMINANCE, GLES20.GL_UNSIGNED_BYTE, y);
            }

            // U texture
            int uvWidth = (width + 1) / 2;
            int uvHeight = (height + 1) / 2;
            u.rewind();
            GLES20.glActiveTexture(GLES20.GL_TEXTURE1);
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, textures[1]);
            if (currentWidth != width || currentHeight != height) {
                GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_LUMINANCE,
                    uvWidth, uvHeight, 0, GLES20.GL_LUMINANCE, GLES20.GL_UNSIGNED_BYTE, u);
                setupTexture();
            } else {
                GLES20.glTexSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0, uvWidth, uvHeight,
                    GLES20.GL_LUMINANCE, GLES20.GL_UNSIGNED_BYTE, u);
            }

            // V texture
            v.rewind();
            GLES20.glActiveTexture(GLES20.GL_TEXTURE2);
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, textures[2]);
            if (currentWidth != width || currentHeight != height) {
                GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_LUMINANCE,
                    uvWidth, uvHeight, 0, GLES20.GL_LUMINANCE, GLES20.GL_UNSIGNED_BYTE, v);
                setupTexture();
            } else {
                GLES20.glTexSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0, uvWidth, uvHeight,
                    GLES20.GL_LUMINANCE, GLES20.GL_UNSIGNED_BYTE, v);
            }

            // A texture
            a.rewind();
            GLES20.glActiveTexture(GLES20.GL_TEXTURE3);
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, textures[3]);
            if (currentWidth != width || currentHeight != height) {
                GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_LUMINANCE,
                    width, height, 0, GLES20.GL_LUMINANCE, GLES20.GL_UNSIGNED_BYTE, a);
                setupTexture();
            } else {
                GLES20.glTexSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0, width, height,
                    GLES20.GL_LUMINANCE, GLES20.GL_UNSIGNED_BYTE, a);
            }

            currentWidth = width;
            currentHeight = height;

            // Draw
            GLES20.glUseProgram(programId);

            int positionHandle = GLES20.glGetAttribLocation(programId, "aPosition");
            int texCoordHandle = GLES20.glGetAttribLocation(programId, "aTexCoord");

            vertexBuffer.position(0);
            GLES20.glVertexAttribPointer(positionHandle, 2, GLES20.GL_FLOAT, false, 16, vertexBuffer);
            GLES20.glEnableVertexAttribArray(positionHandle);

            vertexBuffer.position(2);
            GLES20.glVertexAttribPointer(texCoordHandle, 2, GLES20.GL_FLOAT, false, 16, vertexBuffer);
            GLES20.glEnableVertexAttribArray(texCoordHandle);

            GLES20.glUniform1i(GLES20.glGetUniformLocation(programId, "yTexture"), 0);
            GLES20.glUniform1i(GLES20.glGetUniformLocation(programId, "uTexture"), 1);
            GLES20.glUniform1i(GLES20.glGetUniformLocation(programId, "vTexture"), 2);
            GLES20.glUniform1i(GLES20.glGetUniformLocation(programId, "aTexture"), 3);

            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);

            EGL14.eglSwapBuffers(eglDisplay, eglSurface);

        } catch (Exception e) {
            Log.w(TAG, "Render exception: " + e.getMessage());
        }
    }

    private void setupTexture() {
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        // Let React Native manage lifecycle via release()
    }

    // Native methods (match JNI function names)
    private static native long nativeCreate(int cacheSize, boolean loop);
    private static native void nativeDestroy(long handle);
    private static native void nativeSetListener(long handle, NativePlayerListener listener);
    private static native boolean nativeLoadFromFile(long handle, String path);
    private static native void nativePlay(long handle);
    private static native void nativePause(long handle);
    private static native void nativeStop(long handle);
    private static native String nativeGetFFmpegVersion();
}
