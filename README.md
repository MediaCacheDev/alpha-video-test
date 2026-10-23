# Alpha Video Test

<p align="center">
  <img src="docs/alpha-video-test.avif" alt="The demo app on Android: transparent videos in each format playing over a checkerboard, with FPS, CPU and memory readouts" width="360">
</p>

A React Native app (Android, iOS and web) that plays the same transparent video in every format these packages support, side by side over a checkerboard, with live FPS, CPU and memory readouts. Spawn as many players of each kind as you like and watch what they cost on your own device.

## The players it compares

Each button at the bottom is one player:

| Button | Package | What it plays |
|---|---|---|
| **+ ASTC** | [alpha-video-gpu](https://github.com/MediaCacheDev/alpha-video-gpu) | KTX2 ASTC texture arrays, drawn without decoding: zstd-compressed (**Zstd**) or uncompressed (**Raw**) |
| **+ WebM** (FFmpegKit) | [alpha-video-ffmpegkit](https://github.com/MediaCacheDev/alpha-video-ffmpegkit) | VP9 alpha WebM, single stream only. The first attempt, kept as a reference |
| **+ WebM** (C++) | [alpha-video](https://github.com/MediaCacheDev/alpha-video) | VP8 or VP9 alpha WebM, and dual-stream VP8/VP9/AV1. Its C++ core decodes with libvpx and dav1d; on Android, MediaCodec decodes in hardware where it can |
| **+ APNG**, **+ AVIF** | [react-native-apng-avif](https://github.com/MediaCacheDev/react-native-apng-avif) | Animated PNG and animated AVIF (one package, two buttons) |
| **+ ExoPlayer** (Android) | [exoplayer_alpha](https://github.com/MediaCacheDev/exoplayer-vp9-alpha/tree/feature/vp9-alpha-decoder), a Media3 fork, built from source (see [Setup](#setup)); this app's view is `android/app/src/main/java/dev/mediacache/alphavideotest/exoplayer/` | VP9 alpha WebM, single stream only, in ExoPlayer: its data sources and the fork's `MatroskaExtractor`, which keeps the alpha upstream drops, then FFmpeg's libvpx-vp9. A minimal demo, not published |

The KTX2 files are made with [alpha-video-gpu-encoder](https://github.com/MediaCacheDev/alpha-video-gpu-encoder). [alpha-video](https://github.com/MediaCacheDev/alpha-video#alpha-video-or-alpha-video-gpu) explains when to pick a codec and when ASTC.

The panel on the left picks what the buttons spawn next:

- the clip, under **Real Size**, for every button: **Glow** (400×400, 181 frames at 30 fps, mostly transparent) or **Manta** (1920×1080, 424 frames at 29.97 fps);
- the variant, in a section in the player's colour for each player that reads more than one: **Zstd** or **Raw** for ASTC; for the C++ player **S-VP9** and **S-VP8** (single stream, the alpha inside the VP9 or VP8 stream), **D-VP9**, **D-AV1** and **D-VP8** (dual stream, the alpha in its own track). FFmpegKit and ExoPlayer play S-VP9 only, APNG and AVIF their one file. When the clip has no file of the picked variant, the button plays the first variant that has one.

A player keeps the file it was spawned with, so changing the panel only affects the next spawn. The panels on the right set each player's playback: modes (`preload` or `stream`), the C++ player's decoder (on Android `auto`, `mediacodec`, `mediacodec-hw`, `mediacodec-sw` or `software`; on the web `auto`, `browser`, `webcodecs`, `webcodecs-hw`, `webcodecs-sw` or `software`; iOS always uses `software`) and the KTX2 streaming prefetch and memory strategy. The C++ player's mode, decode queue and prefetch settings are hidden on the web, where its player has none of them, and so is the FFmpegKit panel: on the web that player is a plain `<video>`. These apply to the players already on screen too. Each tile shows its clip, its variant and the decoder it ended up on.

Tiles are 150 px wide, so the 1080p Manta is shrunk about 13 times. ASTC files have no mipmaps, so at that scale Manta looks pixelated in the ASTC tiles, while the video tiles look smoother; the frames themselves are clean. Turn on **Real Size** to draw every player at the clip's own size. The [alpha-video-gpu README](https://github.com/MediaCacheDev/alpha-video-gpu#drawing-size) explains why.

## Using the app

- Pick a clip, and a variant in a player's section of the panel, then tap its **+** button to spawn it. Each player has its own border colour. A greyed-out clip, variant or button has no file in `assets/media/` (see [Demo media](#demo-media)).
- Drag a player by its ✋ grip, change its z-index with ▲/▼ or by typing a number, and close it with ✕. **Clear All** removes every player.
- The bottom panel shows:
  - **FPS**: frames per second (green 55+, yellow 30+, red below 30);
  - **Frame**: the average frame time in milliseconds;
  - **CPU**: the app's CPU time across all threads as a share of the whole device, with the average number of cores kept busy underneath (e.g. `1.8 / 8 cores`);
  - **RAM** and **GPU Mem** (where available), and how many players of each kind are running.

## Setup

```sh
npm install
npm run media                    # asks for small, medium or large, then downloads and makes the clips (see Demo media)

# iOS only
bundle install                   # installs the CocoaPods version pinned in Gemfile
cd ios && bundle exec pod install && cd ..
```

`bundle` is Ruby's Bundler. CocoaPods is a Ruby gem, and the `Gemfile` (from the React Native template) pins versions known to work with React Native, so `bundle exec pod install` runs that CocoaPods rather than whichever is installed globally. If your global CocoaPods works, `cd ios && pod install` does the same. Android needs neither.

The players and range-source come from their releases: the npm packages, `range-source-web` with the web players, and on Android `dev.mediacache:range-source-media3` from Maven Central. To try a player's working copy instead, pack it (`npm pack` in its repository) and install the tarball here (`npm install ../path/to/package-1.0.0.tgz`).

The Android build also needs the Media3 fork for the ExoPlayer button: `android/settings.gradle` includes its modules from `../exoplayer_alpha/media` (branch `feature/vp9-alpha-decoder`), and every Media3 class in the app comes from there. Build its FFmpeg and libvpx once first, as [its module's README](https://github.com/MediaCacheDev/exoplayer-vp9-alpha/blob/feature/vp9-alpha-decoder/libraries/decoder_vp9_alpha/README.md) describes (`libraries/decoder_vp9_alpha/src/main/jni/build_ffmpeg.sh`).

```sh
npm start                        # Metro
npm run android                  # or: npm run ios
npm run web                      # webpack dev server; npm run build:web for a production build
```

On the web, `index.web.js` registers range-source's Service Worker before rendering, and webpack copies `range-source-sw.js` to the root, so the WebM players' `<video>` streams and stores through it as the canvas engines do. Chrome DevTools' Application tab shows it, and Shift-reload is claimed by it again.

## Demo media

The clips live in `assets/media/`, which isn't committed. Everything in it is bundled into the APK, the iOS app and the web build. At most four source files are downloaded; the other variants are made from them on your machine.

`npm run media` asks for one of three sizes, or takes it as an argument (`s`, `m`, `l` or the full name):

| Size | In `assets/media/` | What it does | Plays |
|---|---|---|---|
| `s` small | 11 MB | Downloads Glow as a VP9 WebM and as zstd ASTC KTX2. Makes nothing, so it needs no tools | Glow on the WebM C++, FFmpegKit, ExoPlayer and ASTC Zstd buttons |
| `m` medium | about 335 MB | Downloads Glow and the 1080p Manta (110 MB), then makes every variant but Raw Manta: dual-stream VP9 and AV1, single- and dual-stream VP8, APNG, AVIF and Raw Glow. About 4 minutes, and needs the tools below | Everything but Raw Manta |
| `l` large | about 1.2 GB | Medium, plus Raw Manta: Manta's zstd KTX2 decompressed, 879 MB | Everything |

```sh
npm run media                    # asks for the size
npm run media -- m               # medium, without asking
npm run fetch-media              # just the downloads: the sources from the media-v1 release, checking each SHA-256
npm run make-media               # just the variants, from whichever sources are there
```

The app greys out whatever a size leaves out (see Leaving files out, below). A size also deletes the files it leaves out, since everything in `assets/media/` goes into the app, so running `npm run media -- s` after a large set shrinks it again. Switching back up downloads and makes only what's missing. `fetch-media` and `make-media` take the same `--size`; without it they get every file.

**Downloaded** (listed in `media.manifest.json`, about 110 MB; small takes the two Glow files, 11 MB):

| File | What it is |
|---|---|
| `test_webm.webm` | Glow, VP9 with the alpha inside the stream |
| `manta_1080p_yuva.webm` | Manta, VP9 with the alpha inside the stream |
| `test_stream.ktx2` | Glow, ASTC 4x4, zstd |
| `manta_stream.ktx2` | Manta, ASTC 4x4, zstd |

**Made by `make-media`** (medium and large; about 3 minutes 30 seconds on an M4 Pro, most of it the Manta APNG):

| Variant | Glow | Manta | Made from |
|---|---|---|---|
| D-VP9 | `test_webm_dual.webm`, 0.6 MB | `manta_dual.webm`, 5.2 MB | the VP9 WebM: colour in one VP9 track, the alpha as a grey 4:2:0 VP9 track (`libvpx-vp9`, CRF 30) |
| D-AV1 | `test_webm_dual_av1.webm`, 0.5 MB | `manta_dual_av1.webm`, 4.7 MB | the same, in AV1 (`libsvtav1`, CRF 32, preset 8) |
| S-VP8 | `test_webm_vp8.webm`, 1.5 MB | `manta_vp8.webm`, 10.7 MB | the VP9 WebM, in VP8 with the alpha inside the stream (`libvpx`, CRF 10, capped at 4 Mbit/s). VP8 has one colour matrix, BT.601, which players decode it with, so Manta's BT.709 colours are converted |
| D-VP8 | `test_webm_dual_vp8.webm`, 1.5 MB | `manta_dual_vp8.webm`, 10.6 MB | the same, as two VP8 tracks like D-VP9 |
| APNG | `test_apng.apng`, 20 MB | `manta_apng.apng`, 128 MB | the VP9 WebM's decoded frames, lossless |
| AVIF | `test_avif.avif`, 1.5 MB | `manta_avif.avif`, 7.9 MB | the VP9 WebM's decoded frames (`avifenc`, speed 6, 4:4:4) |
| Raw | `test_uncompressed.ktx2`, 29 MB | `manta_uncompressed.ktx2`, 879 MB | the zstd KTX2, decompressed: the same ASTC blocks, header and keys |

Every variant comes from the same source, so the players show the same pictures. The WebMs keep their source's frame rate, and the VP9 and AV1 ones its colour tags (Manta is BT.709). `make-media` remakes a file only when its source or its recipe has changed (`assets/media/.generated.json` records both); `--force` remakes everything.

**Tools** (medium and large; `make-media` checks them first and names what's missing):

- ffmpeg with libvpx (VP9) and libsvtav1 (AV1). It decodes with libvpx because ffmpeg's own VP9 decoder drops the alpha;
- `avifenc` from libavif;
- `zstd`;
- Node 18 or later.

On macOS: `brew install ffmpeg libavif zstd`. Homebrew's ffmpeg includes libvpx and SVT-AV1.

**Leaving files out.** The app greys out any clip, variant or spawn button whose file isn't in `assets/media/`, so besides the sizes you can leave out any file:

```sh
npm run make-media -- --skip manta_uncompressed           # without the 879 MB Raw Manta
npm run make-media -- --skip 'manta_(uncompressed|apng)'  # and the 128 MB Manta APNG
npm run make-media -- --only manta_dual                   # make just these
```

`--skip` takes a regex on the file name, and deletes a matching file that's already there. A variant whose source wasn't downloaded is left out the same way. Which files are present is read from `src/media.generated.json`, which Metro and webpack rewrite when they start (and `npm install`, `fetch-media` and `make-media` after them). After adding or deleting files by hand, restart Metro, or run `node scripts/media-index.js` while it's running.

With everything in (large), `assets/media/` is about 1.2 GB, most of it Raw Manta; medium or small suit an emulator with little storage. The tests need `test_stream.ktx2` (`test:streaming`), which every size has.

## Tests

The app is also the test bench for the players on Android and iOS: `testing/` drives it on an emulator or simulator, opens one case at a time through deep links and checks what the players draw and what they fetch. Each player's own unit, host and browser tests live in its repo (see [alpha-video](https://github.com/MediaCacheDev/alpha-video#tests) and [alpha-video-gpu](https://github.com/MediaCacheDev/alpha-video-gpu#tests)); this app runs them through React Native on the platforms.

| Command | What it checks | Needs |
|---|---|---|
| `npm test` | Jest: the app renders | nothing |
| `npm run testcards` | Generates the test cards and their fixtures in `testing/build/testcard` | ffmpeg with libvpx and libsvtav1, and [alpha-video-gpu-encoder](https://github.com/MediaCacheDev/alpha-video-gpu-encoder) next to this repo (or `TEXENC=path/to/texenc.js`) |
| `npm run testcards:reference` | The fixtures through FFmpeg's and KTX-Software's decoders (they must pass, or the cards are wrong), and through models of the players' maths | the cards |
| `npm run test:pixels -- --platform <p>` | Every player on every card: frame codes after seeks, alpha, colour, position | the cards, and the Release build on a booted emulator or simulator |
| `npm run test:streaming -- --platform <p>` | Range requests, seeks, storage, headers and data sources, against local servers | the Release build, `test_stream.ktx2` in `assets/media/`, and [range-source](https://github.com/MediaCacheDev/range-source) and [alpha-video-gpu-encoder](https://github.com/MediaCacheDev/alpha-video-gpu-encoder) next to this repo |

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

Rebuild after updating a player or installing a tarball: the app compiles the players' native code from `node_modules`.

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

`test:streaming` plays clips it makes itself (`testing/build/streaming`: 10 s WebMs with ffmpeg, and KTX2 with seek points and uncompressed with texenc), plus the demo's `test_stream.ktx2`, from local servers (range-source's `range-server.mjs`, a sibling checkout), through `alphavideotest://streamtest?…` links; the screen reports its events back over HTTP (`adb reverse` on Android). For each player it checks range requests and a seek that jumps to the Cues or a seek point, a server without range support, replay from the disk store (also after restarting the app) and the memory store with no requests, `source.headers`, and an app data source registered with range-source's `RangeDataSources`: Media3's `DefaultHttpDataSource` on Android (through `dev.mediacache:range-source-media3`), and the URLSession one in `AppDelegate.swift` on iOS. Without `react-native-range-source` installed, it checks the players' basic input instead. alpha-video also checks preload in one request, and on Android the C++ core's range requests. KTX2 cases are named `ktx2 …`. The Android release build allows cleartext HTTP to `127.0.0.1` only.

### Everything, on both platforms

With an emulator and a simulator booted and the Release builds installed:

```sh
npm test && npm run testcards && npm run testcards:reference
for p in android ios; do
  npm run test:pixels -- --platform $p && npm run test:pixels -- --platform $p --playback && npm run test:streaming -- --platform $p
done
```

A full pixel run takes about 25 minutes on the Android emulator and 6 on the iOS simulator.

## License

MIT. The players it compares are separate packages, each with its own license and third-party notices.
