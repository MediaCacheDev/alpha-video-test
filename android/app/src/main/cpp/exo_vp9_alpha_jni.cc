/*
 * ExoPlayer VP9 Alpha Decoder JNI Implementation
 *
 * Standalone VP9 alpha decoder using FFmpeg + libvpx.
 * This is a separate implementation from WebMAlphaPlayer for the ExoPlayer integration.
 */

#include <jni.h>
#include <android/log.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstring>
#include <memory>
#include <mutex>
#include <queue>
#include <string>
#include <thread>
#include <vector>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/avutil.h>
#include <libavutil/imgutils.h>
#include <libavutil/opt.h>
}

#define LOG_TAG "ExoVp9Alpha"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)

// JNI function name prefix - use indirection for proper macro expansion
#define JNI_PREFIX Java_dev_mediacache_alphavideotest_exoplayer_ExoVp9AlphaTextureView_
#define JNI_CONCAT_INNER(prefix, name) prefix##name
#define JNI_CONCAT(prefix, name) JNI_CONCAT_INNER(prefix, name)
#define JNI_FUNC(name) JNI_CONCAT(JNI_PREFIX, name)

/**
 * Decoded YUVA frame
 */
struct YuvaFrame {
    std::vector<uint8_t> y;
    std::vector<uint8_t> u;
    std::vector<uint8_t> v;
    std::vector<uint8_t> a;
    int width = 0;
    int height = 0;
    int yStride = 0;
    int uvStride = 0;
    int64_t pts = 0;
    bool hasAlpha = false;
};

/**
 * Decoder context
 */
class ExoVp9AlphaPlayer {
public:
    ExoVp9AlphaPlayer(int cacheSize, bool loopPlayback);
    ~ExoVp9AlphaPlayer();

    bool loadFromFile(const std::string& path);
    void unload();
    
    void play();
    void pause();
    void stop();
    
    bool isLoaded() const { return loaded_; }
    bool isPlaying() const { return playing_; }
    int getTotalFrames() const { return totalFrames_; }
    int getCurrentFrame() const { return currentFrame_; }
    int getWidth() const { return width_; }
    int getHeight() const { return height_; }
    double getFrameRate() const { return frameRate_; }
    
    void setListener(JNIEnv* env, jobject listener);
    
private:
    bool decodeAllFrames();
    void playbackLoop();
    void notifyFrame(int frameIndex, const YuvaFrame& frame);
    void notifyLoad(int totalFrames, int width, int height);
    void notifyError(const std::string& error);
    void notifyPlay();
    void notifyPause();
    void notifyStop();
    void notifyLoop();
    void notifyEnd();
    
    // FFmpeg resources
    AVFormatContext* formatCtx_ = nullptr;
    AVCodecContext* codecCtx_ = nullptr;
    int videoStreamIndex_ = -1;
    
    // Player state
    std::atomic<bool> loaded_{false};
    std::atomic<bool> playing_{false};
    std::atomic<bool> stopRequested_{false};
    
    // Frame data
    std::vector<YuvaFrame> frames_;
    std::atomic<int> currentFrame_{0};
    int totalFrames_ = 0;
    int width_ = 0;
    int height_ = 0;
    double frameRate_ = 30.0;
    double frameDuration_ = 1.0 / 30.0;
    
    // Configuration
    int cacheSize_;
    bool loopPlayback_;
    
    // Threading
    std::thread playbackThread_;
    std::mutex mutex_;
    std::condition_variable cv_;
    
    // JNI callback
    JavaVM* javaVM_ = nullptr;
    jobject listenerRef_ = nullptr;
    jmethodID onLoadMethod_ = nullptr;
    jmethodID onFrameMethod_ = nullptr;
    jmethodID onPlayMethod_ = nullptr;
    jmethodID onPauseMethod_ = nullptr;
    jmethodID onStopMethod_ = nullptr;
    jmethodID onLoopMethod_ = nullptr;
    jmethodID onEndMethod_ = nullptr;
    jmethodID onErrorMethod_ = nullptr;
};

ExoVp9AlphaPlayer::ExoVp9AlphaPlayer(int cacheSize, bool loopPlayback)
    : cacheSize_(cacheSize), loopPlayback_(loopPlayback) {
    LOGI("ExoVp9AlphaPlayer created (cache=%d, loop=%d)", cacheSize, loopPlayback);
}

ExoVp9AlphaPlayer::~ExoVp9AlphaPlayer() {
    stop();
    unload();
    
    if (listenerRef_) {
        JNIEnv* env;
        if (javaVM_ && javaVM_->GetEnv((void**)&env, JNI_VERSION_1_6) == JNI_OK) {
            env->DeleteGlobalRef(listenerRef_);
        }
    }
    
    LOGI("ExoVp9AlphaPlayer destroyed");
}

void ExoVp9AlphaPlayer::setListener(JNIEnv* env, jobject listener) {
    env->GetJavaVM(&javaVM_);
    
    if (listenerRef_) {
        env->DeleteGlobalRef(listenerRef_);
    }
    listenerRef_ = env->NewGlobalRef(listener);
    
    jclass listenerClass = env->GetObjectClass(listener);
    onLoadMethod_ = env->GetMethodID(listenerClass, "onLoad", "(III)V");
    onFrameMethod_ = env->GetMethodID(listenerClass, "onFrame", 
        "(ILjava/nio/ByteBuffer;Ljava/nio/ByteBuffer;Ljava/nio/ByteBuffer;Ljava/nio/ByteBuffer;II)V");
    onPlayMethod_ = env->GetMethodID(listenerClass, "onPlay", "()V");
    onPauseMethod_ = env->GetMethodID(listenerClass, "onPause", "()V");
    onStopMethod_ = env->GetMethodID(listenerClass, "onStop", "()V");
    onLoopMethod_ = env->GetMethodID(listenerClass, "onLoop", "()V");
    onEndMethod_ = env->GetMethodID(listenerClass, "onEnd", "()V");
    onErrorMethod_ = env->GetMethodID(listenerClass, "onError", "(Ljava/lang/String;)V");
}

bool ExoVp9AlphaPlayer::loadFromFile(const std::string& path) {
    LOGI("Loading file: %s", path.c_str());
    
    unload();
    
    // Open input file
    int ret = avformat_open_input(&formatCtx_, path.c_str(), nullptr, nullptr);
    if (ret < 0) {
        char err[AV_ERROR_MAX_STRING_SIZE];
        av_strerror(ret, err, sizeof(err));
        LOGE("Failed to open file: %s", err);
        notifyError(std::string("Failed to open file: ") + err);
        return false;
    }
    
    // Find stream info
    ret = avformat_find_stream_info(formatCtx_, nullptr);
    if (ret < 0) {
        LOGE("Failed to find stream info");
        notifyError("Failed to find stream info");
        return false;
    }
    
    // Find video stream
    for (unsigned i = 0; i < formatCtx_->nb_streams; i++) {
        if (formatCtx_->streams[i]->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
            videoStreamIndex_ = i;
            break;
        }
    }
    
    if (videoStreamIndex_ < 0) {
        LOGE("No video stream found");
        notifyError("No video stream found");
        return false;
    }
    
    // Find decoder - prefer libvpx-vp9 for alpha support
    AVCodecParameters* codecPar = formatCtx_->streams[videoStreamIndex_]->codecpar;
    const AVCodec* codec = avcodec_find_decoder_by_name("libvpx-vp9");
    if (!codec) {
        LOGI("libvpx-vp9 not found, trying generic VP9");
        codec = avcodec_find_decoder(codecPar->codec_id);
    }
    if (!codec) {
        LOGE("No VP9 decoder found");
        notifyError("No VP9 decoder found");
        return false;
    }
    
    LOGI("Using decoder: %s", codec->name);
    
    // Create codec context
    codecCtx_ = avcodec_alloc_context3(codec);
    if (!codecCtx_) {
        LOGE("Failed to allocate codec context");
        notifyError("Failed to allocate codec context");
        return false;
    }
    
    ret = avcodec_parameters_to_context(codecCtx_, codecPar);
    if (ret < 0) {
        LOGE("Failed to copy codec parameters");
        notifyError("Failed to copy codec parameters");
        return false;
    }
    
    // Configure threading
    codecCtx_->thread_count = 2;
    codecCtx_->thread_type = FF_THREAD_FRAME;
    
    // Open codec
    ret = avcodec_open2(codecCtx_, codec, nullptr);
    if (ret < 0) {
        char err[AV_ERROR_MAX_STRING_SIZE];
        av_strerror(ret, err, sizeof(err));
        LOGE("Failed to open codec: %s", err);
        notifyError(std::string("Failed to open codec: ") + err);
        return false;
    }
    
    // Get frame rate
    AVStream* stream = formatCtx_->streams[videoStreamIndex_];
    if (stream->avg_frame_rate.num > 0 && stream->avg_frame_rate.den > 0) {
        frameRate_ = av_q2d(stream->avg_frame_rate);
    } else if (stream->r_frame_rate.num > 0 && stream->r_frame_rate.den > 0) {
        frameRate_ = av_q2d(stream->r_frame_rate);
    }
    frameDuration_ = 1.0 / frameRate_;
    
    LOGI("Frame rate: %.2f fps, duration: %.4f s", frameRate_, frameDuration_);
    
    // Decode all frames
    if (!decodeAllFrames()) {
        LOGE("Failed to decode frames");
        notifyError("Failed to decode frames");
        return false;
    }
    
    loaded_ = true;
    LOGI("Loaded successfully: %d frames, %dx%d", totalFrames_, width_, height_);
    notifyLoad(totalFrames_, width_, height_);
    
    return true;
}

bool ExoVp9AlphaPlayer::decodeAllFrames() {
    AVPacket* packet = av_packet_alloc();
    AVFrame* frame = av_frame_alloc();
    if (!packet || !frame) {
        if (packet) av_packet_free(&packet);
        if (frame) av_frame_free(&frame);
        return false;
    }
    
    frames_.clear();
    totalFrames_ = 0;
    
    while (av_read_frame(formatCtx_, packet) >= 0) {
        if (packet->stream_index == videoStreamIndex_) {
            int ret = avcodec_send_packet(codecCtx_, packet);
            if (ret < 0) {
                av_packet_unref(packet);
                continue;
            }
            
            while (ret >= 0) {
                ret = avcodec_receive_frame(codecCtx_, frame);
                if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
                    break;
                } else if (ret < 0) {
                    break;
                }
                
                // Store frame dimensions
                if (totalFrames_ == 0) {
                    width_ = frame->width;
                    height_ = frame->height;
                    LOGI("First frame: %dx%d, format=%d (YUVA420P=%d, YUV420P=%d)",
                         width_, height_, frame->format, AV_PIX_FMT_YUVA420P, AV_PIX_FMT_YUV420P);
                }
                
                // Check for alpha
                bool hasAlpha = (frame->format == AV_PIX_FMT_YUVA420P) && 
                               frame->data[3] && frame->linesize[3] > 0;
                
                // Create YUVA frame
                YuvaFrame yuva;
                yuva.width = frame->width;
                yuva.height = frame->height;
                yuva.yStride = frame->width;
                yuva.uvStride = (frame->width + 1) / 2;
                yuva.pts = frame->pts;
                yuva.hasAlpha = hasAlpha;
                
                int uvHeight = (frame->height + 1) / 2;
                int uvWidth = (frame->width + 1) / 2;
                
                // Copy Y plane
                yuva.y.resize(yuva.yStride * frame->height);
                for (int y = 0; y < frame->height; y++) {
                    memcpy(yuva.y.data() + y * yuva.yStride,
                           frame->data[0] + y * frame->linesize[0],
                           frame->width);
                }
                
                // Copy U plane
                yuva.u.resize(yuva.uvStride * uvHeight);
                for (int y = 0; y < uvHeight; y++) {
                    memcpy(yuva.u.data() + y * yuva.uvStride,
                           frame->data[1] + y * frame->linesize[1],
                           uvWidth);
                }
                
                // Copy V plane
                yuva.v.resize(yuva.uvStride * uvHeight);
                for (int y = 0; y < uvHeight; y++) {
                    memcpy(yuva.v.data() + y * yuva.uvStride,
                           frame->data[2] + y * frame->linesize[2],
                           uvWidth);
                }
                
                // Copy or fill A plane
                yuva.a.resize(yuva.yStride * frame->height);
                if (hasAlpha) {
                    for (int y = 0; y < frame->height; y++) {
                        memcpy(yuva.a.data() + y * yuva.yStride,
                               frame->data[3] + y * frame->linesize[3],
                               frame->width);
                    }
                } else {
                    // Fill with opaque
                    memset(yuva.a.data(), 255, yuva.a.size());
                }
                
                frames_.push_back(std::move(yuva));
                totalFrames_++;
                
                av_frame_unref(frame);
            }
        }
        av_packet_unref(packet);
    }
    
    // Flush decoder
    avcodec_send_packet(codecCtx_, nullptr);
    while (true) {
        int ret = avcodec_receive_frame(codecCtx_, frame);
        if (ret == AVERROR_EOF || ret == AVERROR(EAGAIN)) {
            break;
        }
        if (ret < 0) {
            break;
        }
        av_frame_unref(frame);
    }
    
    av_packet_free(&packet);
    av_frame_free(&frame);
    
    LOGI("Decoded %d frames", totalFrames_);
    return totalFrames_ > 0;
}

void ExoVp9AlphaPlayer::unload() {
    stop();
    
    {
        std::lock_guard<std::mutex> lock(mutex_);
        frames_.clear();
        totalFrames_ = 0;
        currentFrame_ = 0;
        loaded_ = false;
    }
    
    if (codecCtx_) {
        avcodec_free_context(&codecCtx_);
        codecCtx_ = nullptr;
    }
    if (formatCtx_) {
        avformat_close_input(&formatCtx_);
        formatCtx_ = nullptr;
    }
    videoStreamIndex_ = -1;
}

void ExoVp9AlphaPlayer::play() {
    if (!loaded_ || playing_) return;
    
    stopRequested_ = false;
    playing_ = true;
    
    notifyPlay();
    
    if (playbackThread_.joinable()) {
        playbackThread_.join();
    }
    
    playbackThread_ = std::thread(&ExoVp9AlphaPlayer::playbackLoop, this);
}

void ExoVp9AlphaPlayer::pause() {
    if (!playing_) return;
    
    stopRequested_ = true;
    cv_.notify_all();
    
    if (playbackThread_.joinable()) {
        playbackThread_.join();
    }
    
    playing_ = false;
    notifyPause();
}

void ExoVp9AlphaPlayer::stop() {
    stopRequested_ = true;
    cv_.notify_all();
    
    if (playbackThread_.joinable()) {
        playbackThread_.join();
    }
    
    playing_ = false;
    currentFrame_ = 0;
    notifyStop();
}

void ExoVp9AlphaPlayer::playbackLoop() {
    LOGI("Playback loop started");
    
    auto lastFrameTime = std::chrono::high_resolution_clock::now();
    
    while (!stopRequested_) {
        int frame = currentFrame_.load();
        
        if (frame >= totalFrames_) {
            if (loopPlayback_) {
                currentFrame_ = 0;
                frame = 0;
                notifyLoop();
            } else {
                notifyEnd();
                break;
            }
        }
        
        // Notify frame
        if (frame < (int)frames_.size()) {
            notifyFrame(frame, frames_[frame]);
        }
        
        currentFrame_++;
        
        // Wait for next frame
        auto now = std::chrono::high_resolution_clock::now();
        auto elapsed = std::chrono::duration<double>(now - lastFrameTime).count();
        double sleepTime = frameDuration_ - elapsed;
        
        if (sleepTime > 0) {
            std::unique_lock<std::mutex> lock(mutex_);
            cv_.wait_for(lock, std::chrono::duration<double>(sleepTime),
                        [this] { return stopRequested_.load(); });
        }
        
        lastFrameTime = std::chrono::high_resolution_clock::now();
    }
    
    playing_ = false;
    LOGI("Playback loop ended");
}

void ExoVp9AlphaPlayer::notifyFrame(int frameIndex, const YuvaFrame& frame) {
    if (!javaVM_ || !listenerRef_ || !onFrameMethod_) return;
    
    JNIEnv* env;
    bool attached = false;
    int status = javaVM_->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (status == JNI_EDETACHED) {
        if (javaVM_->AttachCurrentThread(&env, nullptr) != 0) {
            return;
        }
        attached = true;
    }
    
    // Create direct ByteBuffers
    jobject yBuffer = env->NewDirectByteBuffer((void*)frame.y.data(), frame.y.size());
    jobject uBuffer = env->NewDirectByteBuffer((void*)frame.u.data(), frame.u.size());
    jobject vBuffer = env->NewDirectByteBuffer((void*)frame.v.data(), frame.v.size());
    jobject aBuffer = env->NewDirectByteBuffer((void*)frame.a.data(), frame.a.size());
    
    env->CallVoidMethod(listenerRef_, onFrameMethod_,
        frameIndex, yBuffer, uBuffer, vBuffer, aBuffer, frame.width, frame.height);
    
    env->DeleteLocalRef(yBuffer);
    env->DeleteLocalRef(uBuffer);
    env->DeleteLocalRef(vBuffer);
    env->DeleteLocalRef(aBuffer);
    
    if (attached) {
        javaVM_->DetachCurrentThread();
    }
}

void ExoVp9AlphaPlayer::notifyLoad(int totalFrames, int width, int height) {
    if (!javaVM_ || !listenerRef_ || !onLoadMethod_) return;
    
    JNIEnv* env;
    bool attached = false;
    int status = javaVM_->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (status == JNI_EDETACHED) {
        if (javaVM_->AttachCurrentThread(&env, nullptr) != 0) return;
        attached = true;
    }
    
    env->CallVoidMethod(listenerRef_, onLoadMethod_, totalFrames, width, height);
    
    if (attached) javaVM_->DetachCurrentThread();
}

void ExoVp9AlphaPlayer::notifyError(const std::string& error) {
    if (!javaVM_ || !listenerRef_ || !onErrorMethod_) return;
    
    JNIEnv* env;
    bool attached = false;
    int status = javaVM_->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (status == JNI_EDETACHED) {
        if (javaVM_->AttachCurrentThread(&env, nullptr) != 0) return;
        attached = true;
    }
    
    jstring errorStr = env->NewStringUTF(error.c_str());
    env->CallVoidMethod(listenerRef_, onErrorMethod_, errorStr);
    env->DeleteLocalRef(errorStr);
    
    if (attached) javaVM_->DetachCurrentThread();
}

void ExoVp9AlphaPlayer::notifyPlay() {
    if (!javaVM_ || !listenerRef_ || !onPlayMethod_) return;
    
    JNIEnv* env;
    bool attached = false;
    int status = javaVM_->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (status == JNI_EDETACHED) {
        if (javaVM_->AttachCurrentThread(&env, nullptr) != 0) return;
        attached = true;
    }
    
    env->CallVoidMethod(listenerRef_, onPlayMethod_);
    
    if (attached) javaVM_->DetachCurrentThread();
}

void ExoVp9AlphaPlayer::notifyPause() {
    if (!javaVM_ || !listenerRef_ || !onPauseMethod_) return;
    
    JNIEnv* env;
    bool attached = false;
    int status = javaVM_->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (status == JNI_EDETACHED) {
        if (javaVM_->AttachCurrentThread(&env, nullptr) != 0) return;
        attached = true;
    }
    
    env->CallVoidMethod(listenerRef_, onPauseMethod_);
    
    if (attached) javaVM_->DetachCurrentThread();
}

void ExoVp9AlphaPlayer::notifyStop() {
    if (!javaVM_ || !listenerRef_ || !onStopMethod_) return;
    
    JNIEnv* env;
    bool attached = false;
    int status = javaVM_->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (status == JNI_EDETACHED) {
        if (javaVM_->AttachCurrentThread(&env, nullptr) != 0) return;
        attached = true;
    }
    
    env->CallVoidMethod(listenerRef_, onStopMethod_);
    
    if (attached) javaVM_->DetachCurrentThread();
}

void ExoVp9AlphaPlayer::notifyLoop() {
    if (!javaVM_ || !listenerRef_ || !onLoopMethod_) return;
    
    JNIEnv* env;
    bool attached = false;
    int status = javaVM_->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (status == JNI_EDETACHED) {
        if (javaVM_->AttachCurrentThread(&env, nullptr) != 0) return;
        attached = true;
    }
    
    env->CallVoidMethod(listenerRef_, onLoopMethod_);
    
    if (attached) javaVM_->DetachCurrentThread();
}

void ExoVp9AlphaPlayer::notifyEnd() {
    if (!javaVM_ || !listenerRef_ || !onEndMethod_) return;
    
    JNIEnv* env;
    bool attached = false;
    int status = javaVM_->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (status == JNI_EDETACHED) {
        if (javaVM_->AttachCurrentThread(&env, nullptr) != 0) return;
        attached = true;
    }
    
    env->CallVoidMethod(listenerRef_, onEndMethod_);
    
    if (attached) javaVM_->DetachCurrentThread();
}

//==============================================================================
// JNI Functions
//==============================================================================

extern "C" {

JNIEXPORT jlong JNICALL
JNI_FUNC(nativeCreate)(JNIEnv* env, jclass clazz, jint cacheSize, jboolean loop) {
    LOGI("nativeCreate: cacheSize=%d, loop=%d", cacheSize, loop);
    auto* player = new ExoVp9AlphaPlayer(cacheSize, loop);
    return reinterpret_cast<jlong>(player);
}

JNIEXPORT void JNICALL
JNI_FUNC(nativeDestroy)(JNIEnv* env, jclass clazz, jlong handle) {
    LOGI("nativeDestroy");
    auto* player = reinterpret_cast<ExoVp9AlphaPlayer*>(handle);
    if (player) {
        delete player;
    }
}

JNIEXPORT void JNICALL
JNI_FUNC(nativeSetListener)(JNIEnv* env, jclass clazz, jlong handle, jobject listener) {
    auto* player = reinterpret_cast<ExoVp9AlphaPlayer*>(handle);
    if (player && listener) {
        player->setListener(env, listener);
    }
}

JNIEXPORT jboolean JNICALL
JNI_FUNC(nativeLoadFromFile)(JNIEnv* env, jclass clazz, jlong handle, jstring path) {
    auto* player = reinterpret_cast<ExoVp9AlphaPlayer*>(handle);
    if (!player) return JNI_FALSE;
    
    const char* pathStr = env->GetStringUTFChars(path, nullptr);
    bool result = player->loadFromFile(pathStr);
    env->ReleaseStringUTFChars(path, pathStr);
    
    return result ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
JNI_FUNC(nativePlay)(JNIEnv* env, jclass clazz, jlong handle) {
    auto* player = reinterpret_cast<ExoVp9AlphaPlayer*>(handle);
    if (player) player->play();
}

JNIEXPORT void JNICALL
JNI_FUNC(nativePause)(JNIEnv* env, jclass clazz, jlong handle) {
    auto* player = reinterpret_cast<ExoVp9AlphaPlayer*>(handle);
    if (player) player->pause();
}

JNIEXPORT void JNICALL
JNI_FUNC(nativeStop)(JNIEnv* env, jclass clazz, jlong handle) {
    auto* player = reinterpret_cast<ExoVp9AlphaPlayer*>(handle);
    if (player) player->stop();
}

JNIEXPORT jstring JNICALL
JNI_FUNC(nativeGetFFmpegVersion)(JNIEnv* env, jclass clazz) {
    return env->NewStringUTF(av_version_info());
}

} // extern "C"
