package com.alphavideotest

import android.app.Application
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.alphavideotest.exoplayer.RNExoVp9AlphaPackage
import dev.mediacache.alphavideo.AlphaVideoDataSources
import dev.mediacache.alphavideo.gpu.AlphaVideoGpuDataSources
import dev.mediacache.alphavideo.gpu.media3.Media3AlphaVideoGpuDataSource
import dev.mediacache.alphavideo.media3.Media3AlphaVideoDataSource

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          add(PerformanceMetricsPackage())
          add(KeepAwakePackage())
          add(RNExoVp9AlphaPackage())
        },
    )
  }

  @OptIn(UnstableApi::class)
  override fun onCreate() {
    super.onCreate()
    // The stream tests' data sources (testing/streaming): Media3's HTTP stack, by its user agent
    val media3 = DefaultHttpDataSource.Factory().setUserAgent("AlphaVideoTest-Media3")
    AlphaVideoDataSources.register("media3", Media3AlphaVideoDataSource.factory(media3))
    AlphaVideoGpuDataSources.register("media3", Media3AlphaVideoGpuDataSource.factory(media3))
    loadReactNative(this)
  }
}
