package dev.mediacache.alphavideotest.exoplayer;

import androidx.annotation.NonNull;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * React Native package for ExoPlayer-based VP9 Alpha player.
 */
public class RNExoVp9AlphaPackage implements ReactPackage {

    @NonNull
    @Override
    public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }

    @NonNull
    @Override
    public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext reactContext) {
        List<ViewManager> viewManagers = new ArrayList<>();
        viewManagers.add(new RNExoVp9AlphaViewManager());
        return viewManagers;
    }
}
