package dev.mediacache.alphavideotest.exoplayer;

import android.util.Log;
import android.view.View;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.Map;

/**
 * React Native ViewManager for ExoPlayer-based VP9 Alpha player.
 * 
 * This exposes the ExoVp9AlphaTextureView to React Native as "RNExoVp9AlphaView".
 */
public class RNExoVp9AlphaViewManager extends SimpleViewManager<ExoVp9AlphaTextureView> {

    private static final String TAG = "RNExoVp9AlphaVM";
    public static final String REACT_CLASS = "RNExoVp9AlphaView";

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @NonNull
    @Override
    protected ExoVp9AlphaTextureView createViewInstance(@NonNull ThemedReactContext reactContext) {
        Log.i(TAG, "Creating ExoVp9AlphaTextureView instance");
        ExoVp9AlphaTextureView view = new ExoVp9AlphaTextureView(reactContext);
        return view;
    }

    @Override
    public void onDropViewInstance(@NonNull ExoVp9AlphaTextureView view) {
        Log.i(TAG, "Dropping view instance");
        view.release();
        super.onDropViewInstance(view);
    }

    @ReactProp(name = "source")
    public void setSource(ExoVp9AlphaTextureView view, @Nullable ReadableMap source) {
        if (source == null || !source.hasKey("uri")) {
            Log.w(TAG, "Invalid source prop");
            return;
        }
        
        String uri = source.getString("uri");
        Log.i(TAG, "Setting source: " + uri);
        
        if (uri != null) {
            if (uri.startsWith("http://") || uri.startsWith("https://")) {
                view.loadFromUrl(uri);
            } else if (uri.startsWith("file://")) {
                view.loadFromFile(uri.substring(7));
            } else {
                view.loadFromFile(uri);
            }
        }
    }

    @ReactProp(name = "autoPlay", defaultBoolean = true)
    public void setAutoPlay(ExoVp9AlphaTextureView view, boolean autoPlay) {
        view.setAutoplay(autoPlay);
    }

    @ReactProp(name = "loop", defaultBoolean = true)
    public void setLoop(ExoVp9AlphaTextureView view, boolean loop) {
        view.setLoop(loop);
    }

    @ReactProp(name = "paused", defaultBoolean = false)
    public void setPaused(ExoVp9AlphaTextureView view, boolean paused) {
        if (paused) {
            view.pause();
        } else {
            view.play();
        }
    }

    @Nullable
    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.of(
            "onLoad", MapBuilder.of("registrationName", "onLoad"),
            "onError", MapBuilder.of("registrationName", "onError")
        );
    }
}
