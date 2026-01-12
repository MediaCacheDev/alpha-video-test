package com.alphavideotest;

import android.app.Activity;
import android.view.WindowManager;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class KeepAwakeModule extends ReactContextBaseJavaModule {
    public KeepAwakeModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "KeepAwake";
    }

    @ReactMethod
    public void activate() {
        final Activity activity = getCurrentActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
    }

    @ReactMethod
    public void deactivate() {
        final Activity activity = getCurrentActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
    }
}
