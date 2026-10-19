# Alpha Video Test

A React Native app (Android, iOS and web) that plays the same transparent video in every format these packages support, side by side over a checkerboard, with live FPS, CPU and memory readouts. Spawn as many players of each kind as you like and watch what they cost on your own device.

## The players it compares

| Button | Package | Format |
|---|---|---|
| **+ ASTC** | [alpha-video-gpu](https://github.com/MediaCacheDev/alpha-video-gpu) | KTX2 ASTC texture array, zstd-compressed, drawn without decoding |
| **+ Raw** | [alpha-video-gpu](https://github.com/MediaCacheDev/alpha-video-gpu) | KTX2 ASTC texture array, uncompressed (read straight from the file) |
| **+ WebM** (C++ FFmpeg) | [alpha-video](https://github.com/MediaCacheDev/alpha-video) | VP8 or VP9 alpha WebM, or dual-stream VP8/VP9/AV1; MediaCodec in hardware on Android where it can |
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

## Tests

The app is also the test bench for the players on Android and iOS: `testing/` drives it on an emulator or simulator, opens one case at a time through deep links and checks what the players draw and what they fetch. Each player's own unit, host and browser tests live in its repo (see [alpha-video](https://github.com/MediaCacheDev/alpha-video#tests) and [alpha-video-gpu](https://github.com/MediaCacheDev/alpha-video-gpu#tests)); this app runs them through React Native on the platforms.

| Command | What it checks | Needs |
|---|---|---|
| `npm test` | Jest: the app renders | nothing |
| `npm run testcards` | Generates the test cards and their fixtures in `testing/build/testcard` | ffmpeg with libvpx and libsvtav1, and [alpha-video-gpu-encoder](https://github.com/MediaCacheDev/alpha-video-gpu-encoder) next to this repo (or `TEXENC=path/to/texenc.js`) |
| `npm run testcards:reference` | The fixtures through FFmpeg's and KTX-Software's decoders (they must pass, or the cards are wrong), and through models of the players' maths | the cards |
| `npm run test:pixels -- --platform <p>` | Every player on every card: frame codes after seeks, alpha, colour, position | the cards, and the Release build on a booted emulator or simulator |
| `npm run test:streaming -- --platform <p>` | Range requests, seeks, storage, headers and data sources, against local servers | the Release build, and [alpha-video-source](https://github.com/MediaCacheDev/alpha-video-source) next to this repo |

### The Release build

The device tests run the bundled JavaScript, so they need a Release build installed:

```sh
# Android (arm64-v8a only keeps the APK small enough for an emulator's storage)
cd android && ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a && cd ..
adb install -r android/app/build/outputs/apk/release/app-release.apk

# iOS simulator
cd ios && xcodebuild -workspace AlphaVideoTest.xcworkspace -scheme AlphaVideoTest -configuration Release \
  -sdk iphonesimulator -derivedDataPath build/dd build && cd ..
xcrun simctl install booted ios/build/dd/Build/Products/Release-iphonesimulator/AlphaVideoTest.app
```

Rebuild after installing new package tarballs: the app compiles the players' native code from `node_modules`.

### Pixel tests

```sh
npm run test:pixels -- --platform android      # every case on the emulator or a connected phone
npm run test:pixels -- --platform ios          # every case on the booted simulator
```

They copy the fixtures to the device, open `alphavideotest://pixeltest?…` links (on iOS, by writing them to the app's `Documents/pixeltest/link.txt`), capture each frame over black and over white, and write `testing/build/pixels/<platform>/report.html`. Cases listed in `testing/pixels/known.ts` fail for known reasons (mostly the emulator's GPU and decoders) and don't fail the run; one that passes fails it, so the list stays current.

Each case is named `<card>/<fixture> <player> <mode>[ <decoder>][ <memoryStrategy>]`, e.g. `card_256x256/dual_vp8.webm cpp default mediacodec-hw`. Narrow a run with:

- `--player`: one or more of `cpp` (alpha-video), `gpu` (alpha-video-gpu), `ffk-gpu` and `ffk-cpu` (alpha-video-ffmpegkit's two renderers, VP9 only);
- `--only <regex>`, matched against the case name: a card, a fixture, a codec, a mode or an Android decoder;
- `--frames 0,37`: which frames to check (default `0,1,29,30,31,37,59`);
- `--playback`: play and loop each case instead, reading the frame code from screenshots, and fail on a stall, a step backwards or no loop;
- `--codecs vpx`: the codec modules the build includes (`"react-native-alpha-video": { "codecs" }` in `package.json`; default `vpx,av1`). Cases that need a missing module must report `NO_DECODER`.

```sh
npm run test:pixels -- --platform android --player cpp                    # alpha-video only
npm run test:pixels -- --platform ios --player gpu                        # alpha-video-gpu only
npm run test:pixels -- --platform android --player ffk-gpu,ffk-cpu        # alpha-video-ffmpegkit only
npm run test:pixels -- --platform android --player cpp --only mediacodec  # alpha-video on MediaCodec (hardware and software)
npm run test:pixels -- --platform android --only ' software'              # alpha-video's C++ core on Android
npm run test:pixels -- --platform ios --only 'vp8'                        # the VP8 fixtures
npm run test:pixels -- --platform ios --only '256x256/dual_av1.webm' --frames 0,37
npm run test:pixels -- --platform android --player gpu --only 'stream ram'      # alpha-video-gpu streaming from RAM
npm run test:pixels -- --platform ios --playback                          # playback and looping, every player
```

On Android, alpha-video's cases run each decoder: `auto` (no decoder in the name), `software` (the C++ core, also with `preload`), `mediacodec-hw` and `mediacodec-sw`. On iOS it has one path, the C++ core, in `default` and `preload` modes. alpha-video-gpu's cases are `default` (streaming into VRAM), `stream ram` and `preload`.

### Streaming tests

```sh
npm run test:streaming -- --platform android   # or ios
npm run test:streaming -- --platform ios --player cpp     # react-native-alpha-video (WebM) only
npm run test:streaming -- --platform ios --player gpu     # react-native-alpha-video-gpu (KTX2) only
npm run test:streaming -- --platform android --only 'replay'   # by case name
```

`test:streaming` plays 10 s clips made with ffmpeg (`testing/build/streaming`) from local servers (alpha-video-source's `range-server.mjs`, a sibling checkout), through `alphavideotest://streamtest?…` links; the screen reports its events back over HTTP (`adb reverse` on Android). For each player it checks range requests and a seek that jumps to the Cues or a seek point, a server without range support, replay from the disk store (also after restarting the app) and the memory store with no requests, `source.headers`, and an app data source: Media3's `DefaultHttpDataSource` on Android (through `alpha-video-media3` and `alpha-video-gpu-media3`), and the URLSession one in `AppDelegate.swift` on iOS. alpha-video also checks preload in one request, and on Android the C++ core's range requests. KTX2 cases are named `ktx2 …`. The Android release build allows cleartext HTTP to `127.0.0.1` only.

### Everything, on both platforms

With an emulator and a simulator booted and the Release builds installed:

```sh
npm test && npm run testcards && npm run testcards:reference
for p in android ios; do
  npm run test:pixels -- --platform $p && npm run test:pixels -- --platform $p --playback && npm run test:streaming -- --platform $p
done
```

A full pixel run takes about 25 minutes on the Android emulator and 6 on the iOS simulator.
