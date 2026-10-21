package dev.mediacache.alphavideotest.exoplayer;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.annotations.ReactProp;
import com.facebook.react.uimanager.events.Event;
import com.facebook.react.uimanager.events.EventDispatcher;

import java.util.Map;

/**
 * React Native ViewManager for the ExoPlayer VP9 alpha player.
 *
 * This exposes ExoVp9AlphaView to React Native as "RNExoVp9AlphaView".
 */
public class RNExoVp9AlphaViewManager extends SimpleViewManager<ExoVp9AlphaView> {

    public static final String REACT_CLASS = "RNExoVp9AlphaView";

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @NonNull
    @Override
    protected ExoVp9AlphaView createViewInstance(@NonNull ThemedReactContext reactContext) {
        ExoVp9AlphaView view = new ExoVp9AlphaView(reactContext);
        view.setEvents(new ExoVp9AlphaView.Events() {
            @Override
            public void onLoad(int width, int height, String decoder) {
                WritableMap event = Arguments.createMap();
                event.putInt("width", width);
                event.putInt("height", height);
                event.putString("decoder", decoder);
                send(view, "onLoad", event);
            }

            @Override
            public void onError(String error) {
                WritableMap event = Arguments.createMap();
                event.putString("error", error);
                send(view, "onError", event);
            }
        });
        return view;
    }

    @Override
    public void onDropViewInstance(@NonNull ExoVp9AlphaView view) {
        view.release();
        super.onDropViewInstance(view);
    }

    @ReactProp(name = "source")
    public void setSource(ExoVp9AlphaView view, @Nullable ReadableMap source) {
        view.setSource(source != null && source.hasKey("uri") ? source.getString("uri") : null);
    }

    @ReactProp(name = "autoPlay", defaultBoolean = true)
    public void setAutoPlay(ExoVp9AlphaView view, boolean autoPlay) {
        view.setAutoPlay(autoPlay);
    }

    @ReactProp(name = "loop", defaultBoolean = true)
    public void setLoop(ExoVp9AlphaView view, boolean loop) {
        view.setLoop(loop);
    }

    @ReactProp(name = "paused", defaultBoolean = false)
    public void setPaused(ExoVp9AlphaView view, boolean paused) {
        view.setPaused(paused);
    }

    @Nullable
    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.of(
            "onLoad", MapBuilder.of("registrationName", "onLoad"),
            "onError", MapBuilder.of("registrationName", "onError")
        );
    }

    private static void send(ExoVp9AlphaView view, String eventName, WritableMap params) {
        ReactContext context = (ReactContext) view.getContext();
        EventDispatcher dispatcher = UIManagerHelper.getEventDispatcherForReactTag(context, view.getId());
        if (dispatcher == null) return;
        dispatcher.dispatchEvent(
            new PlayerEvent(UIManagerHelper.getSurfaceId(view), view.getId(), eventName, params));
    }

    private static final class PlayerEvent extends Event<PlayerEvent> {
        private final String eventName;
        private final WritableMap eventData;

        PlayerEvent(int surfaceId, int viewTag, String eventName, WritableMap eventData) {
            super(surfaceId, viewTag);
            this.eventName = eventName;
            this.eventData = eventData;
        }

        @NonNull
        @Override
        public String getEventName() {
            return eventName;
        }

        @Override
        public boolean canCoalesce() {
            return false;
        }

        @Nullable
        @Override
        protected WritableMap getEventData() {
            return eventData;
        }
    }
}
