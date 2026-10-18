# Alpha Video Test

A React Native app (Android, iOS and web) that plays the same transparent video in every format these packages support, side by side over a checkerboard, with live FPS, CPU and memory readouts. Spawn as many players of each kind as you like and watch what they cost on your own device.

## The players it compares

| Button | Package | Format |
|---|---|---|
| **+ ASTC** | [alpha-video-gpu](https://github.com/MediaCacheDev/alpha-video-gpu) | KTX2 ASTC texture array, zstd-compressed, drawn without decoding |
| **+ Raw** | [alpha-video-gpu](https://github.com/MediaCacheDev/alpha-video-gpu) | KTX2 ASTC texture array, uncompressed (read straight from the file) |
| **+ WebM** (C++ FFmpeg) | [alpha-video](https://github.com/MediaCacheDev/alpha-video) | VP9 alpha WebM, or dual-stream VP9/AV1; MediaCodec in hardware on Android where it can |
| **+ WebM** (FFmpegKit) | [alpha-video-ffmpegkit](https://github.com/MediaCacheDev/alpha-video-ffmpegkit) | VP9 alpha WebM, the first attempt, kept as a reference |
| **+ ExoPlayer** (Android) | in this app (`android/app/src/main/java/com/alphavideotest/exoplayer/`) | VP9 alpha WebM in an ExoPlayer-style view that demuxes and decodes with FFmpeg (ExoPlayer's demuxer drops the alpha); an experiment, not published |
| **+ APNG**, **+ AVIF** | [react-native-apng-avif](https://github.com/MediaCacheDev/react-native-apng-avif) | Animated PNG and animated AVIF |

The KTX2 files are made with [alpha-video-gpu-encoder](https://github.com/MediaCacheDev/alpha-video-gpu-encoder). [alpha-video](https://github.com/MediaCacheDev/alpha-video#alpha-video-or-alpha-video-gpu) explains when to pick a codec and when ASTC.

The settings panels choose the clip (a 400×400 glow or a 1080p manta, single-stream or dual-stream VP9/AV1), each player's mode (`preload` or `stream`), the C++ player's decoder on Android (`auto`, `mediacodec-hw`, `software`, ...) and the KTX2 streaming buffers. Each tile shows the decoder it ended up on.

## Using the app

- Tap a **+** button to spawn a player; each format has its own border colour.
- Drag a player by its ✋ grip, change its z-index with ▲/▼ or by typing a number, and close it with ✕. **Clear All** removes every player.
- The bottom panel shows:
  - **FPS**: frames per second (green 55+, yellow 30+, red below 30);
  - **Frame**: the average frame time in milliseconds;
  - **CPU**: the app's CPU time across all threads as a share of the whole device, with the average number of cores kept busy underneath (e.g. `1.8 / 8 cores`);
  - **RAM** and **GPU Mem** (where available), and how many players of each kind are running.

## Setup

```sh
npm install
npm run fetch-media              # downloads the clips into assets/media/ from the media-v1 release
bundle install && cd ios && bundle exec pod install && cd ..
```

Until the packages are on npm, `package.json` installs them from tarballs packed in the sibling repos (`../webmvp9alphaplayer/...`, `../ktx2player/...`, `../react-native-apng-avif/...`).

```sh
npm start                        # Metro
npm run android                  # or: npm run ios
npm run web                      # webpack dev server; npm run build:web for a production build
```

The pixel tests below need a Release build: `cd android && ./gradlew :app:assembleRelease`, or `xcodebuild` with `-configuration Release` on iOS.

## Pixel tests

`testing/` checks what the players actually draw against generated test cards:

```sh
npm run testcards                              # generate the cards and fixtures (testing/build/testcard)
npm run testcards:reference                    # probe FFmpeg's and KTX-Software's decodes, and the player models
npm run test:pixels -- --platform android      # or ios; --only <regex>, --frames 0,37
npm run test:pixels -- --platform android --playback   # play and loop each case instead
```

`test:pixels` needs the release build installed on a booted emulator or simulator. It copies the fixtures over, opens `alphavideotest://pixeltest?…` links (on iOS, by writing them to the app's `Documents/pixeltest/link.txt`), captures each frame over black and over white, and writes `testing/build/pixels/<platform>/report.html`. With `--playback` it reads the frame code from screenshots while each case loops, and fails on a stall, a step backwards or no loop. Cases listed in `testing/pixels/known.ts` fail for known reasons and don't fail the run.

## Streaming tests

```sh
npm run test:streaming -- --platform android   # or ios; --only <regex>
```

`test:streaming` plays 10 s clips made with ffmpeg (`testing/build/streaming`) in `react-native-alpha-video` from local servers (alpha-video-source's `range-server.mjs`, a sibling checkout), through `alphavideotest://streamtest?…` links; the screen reports its events back over HTTP (`adb reverse` on Android). It checks range requests and a seek that jumps to the Cues, a server without range support, preload in one request, replay from the disk store (also after restarting the app) and the memory store with no requests, `source.headers`, and an app data source: Media3's `DefaultHttpDataSource` through `alpha-video-media3` on Android (compiled from the player repo's `android/media3`), and the URLSession one in `AppDelegate.swift` on iOS. Like the pixel tests it needs the release build installed; the Android release build allows cleartext HTTP to `127.0.0.1` only.
