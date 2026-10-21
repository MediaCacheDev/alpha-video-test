package dev.mediacache.alphavideotest.exoplayer;

import android.content.Context;
import android.net.Uri;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.decoder.vp9alpha.Vp9AlphaLibrary;
import androidx.media3.decoder.vp9alpha.Vp9AlphaTextureView;
import androidx.media3.decoder.vp9alpha.Vp9AlphaVideoRenderer;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.Renderer;
import androidx.media3.exoplayer.analytics.AnalyticsListener;

/**
 * ExoPlayer with the exoplayer_alpha fork's VP9-alpha renderer, drawing into this view.
 *
 * <p>ExoPlayer does the rest as for any video: its data sources open the URI, its
 * MatroskaExtractor demuxes the WebM (the fork's passes the alpha frames on), and the renderer
 * decodes a few frames ahead of playback.
 */
@OptIn(markerClass = UnstableApi.class)
public class ExoVp9AlphaView extends Vp9AlphaTextureView {

    private static final String TAG = "ExoVp9AlphaView";

    /** Gets the view's load and error events to JS. */
    public interface Events {
        void onLoad(int width, int height, String decoder);

        void onError(String error);
    }

    private final ExoPlayer player;
    @Nullable private Events events;
    @Nullable private String uri;
    private boolean autoPlay = true;
    private boolean paused;
    private boolean loaded;
    private boolean released;

    public ExoVp9AlphaView(Context context) {
        super(context);
        Vp9AlphaVideoRenderer[] renderer = new Vp9AlphaVideoRenderer[1];
        player = new ExoPlayer.Builder(context, (handler, videoListener, audioListener, textOutput, metadataOutput) -> {
                    renderer[0] = new Vp9AlphaVideoRenderer(
                            /* allowedJoiningTimeMs= */ 0, handler, videoListener, /* maxDroppedFramesToNotify= */ 10);
                    return new Renderer[] {renderer[0]};
                })
                // The demo's clips are a few MB; a few seconds ahead is plenty, with many players on screen
                .setLoadControl(new DefaultLoadControl.Builder()
                        .setBufferDurationsMs(2_000, 5_000, 500, 1_000)
                        .build())
                .build();
        player.setRepeatMode(Player.REPEAT_MODE_ONE);
        player.createMessage(renderer[0])
                .setType(Renderer.MSG_SET_VIDEO_OUTPUT)
                .setPayload(this)
                .send();
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY && !loaded) {
                    loaded = true;
                    reportLoad();
                }
            }

            @Override
            public void onPlayerError(@NonNull PlaybackException error) {
                Log.e(TAG, "Playback failed: " + uri, error);
                if (events != null) {
                    Throwable cause = error.getCause();
                    events.onError(cause != null && cause.getMessage() != null
                            ? error.getErrorCodeName() + ": " + cause.getMessage()
                            : error.getErrorCodeName());
                }
            }
        });
        player.addAnalyticsListener(new AnalyticsListener() {
            @Override
            public void onDroppedVideoFrames(@NonNull EventTime eventTime, int droppedFrames, long elapsedMs) {
                Log.w(TAG, droppedFrames + " frames dropped in " + elapsedMs + " ms: " + uri);
            }
        });
    }

    public void setEvents(@Nullable Events events) {
        this.events = events;
    }

    public void setSource(@Nullable String uri) {
        if (uri == null || uri.equals(this.uri)) return;
        this.uri = uri;
        loaded = false;
        player.setMediaItem(MediaItem.fromUri(toExoUri(uri)));
        player.prepare();
        updatePlayWhenReady();
    }

    public void setAutoPlay(boolean autoPlay) {
        this.autoPlay = autoPlay;
        updatePlayWhenReady();
    }

    public void setPaused(boolean paused) {
        this.paused = paused;
        updatePlayWhenReady();
    }

    public void setLoop(boolean loop) {
        player.setRepeatMode(loop ? Player.REPEAT_MODE_ONE : Player.REPEAT_MODE_OFF);
    }

    /** Also runs when the view leaves the window, and again when React Native drops it. */
    @Override
    public void release() {
        if (released) return;
        released = true;
        player.release();
        super.release();
    }

    private void updatePlayWhenReady() {
        player.setPlayWhenReady(autoPlay && !paused);
    }

    private void reportLoad() {
        if (events == null) return;
        Format format = player.getVideoFormat();
        int width = format != null ? format.width : 0;
        int height = format != null ? format.height : 0;
        events.onLoad(width, height, "libvpx-vp9 (FFmpeg " + Vp9AlphaLibrary.getFFmpegVersion() + ")");
    }

    /**
     * The demo's {@code asset://media/x} is {@code asset:///media/x} to ExoPlayer, whose
     * AssetDataSource reads the URI's path. Every other URI (http, file, content) goes as is.
     */
    private static Uri toExoUri(String uri) {
        if (uri.startsWith("asset://") && !uri.startsWith("asset:///")) {
            return Uri.parse("asset:///" + uri.substring("asset://".length()));
        }
        return Uri.parse(uri);
    }
}
