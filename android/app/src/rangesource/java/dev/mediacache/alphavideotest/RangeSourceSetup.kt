package dev.mediacache.alphavideotest

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import dev.mediacache.rangesource.RangeDataSources
import dev.mediacache.rangesource.media3.Media3RangeDataSource

/** Built only with react-native-range-source installed (app/build.gradle); MainApplication calls it. */
object RangeSourceSetup {
  // The stream tests' data source (testing/streaming), for both players: Media3's HTTP stack, by its user agent
  @OptIn(UnstableApi::class)
  @JvmStatic
  fun registerDataSources() {
    val media3 = DefaultHttpDataSource.Factory().setUserAgent("AlphaVideoTest-Media3")
    RangeDataSources.register("media3", Media3RangeDataSource.factory(media3))
  }
}
