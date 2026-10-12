# Alpha Video Test

A React Native demo app comparing different **transparent animation formats** with real-time performance metrics.

## Supported Formats

| Format | Container | Codec | Description |
|--------|-----------|-------|-------------|
| **ASTC** | KTX2 | ASTC | GPU-native compressed textures. Best performance, hardware-decoded directly on GPU. Ideal for games and high-performance apps. |
| **WebM** | WebM | VP9+Alpha | Video with alpha channel. Good compression, software-decoded. Widely supported on web. |
| **APNG** | APNG | PNG frames | Animated PNG with full alpha. Lossless, larger file sizes. Good for simple animations. |
| **AVIF** | AVIF | AV1 | Modern image format with excellent compression and alpha support. Smaller files than APNG. |

## Features

- **Checkerboard background** - Demonstrates transparency support for all formats
- **Spawn animations** - Create multiple instances of each format type
- **Draggable containers** - Move animations around with grip handle
- **Z-index controls** - Adjust stacking order with up/down arrows or input
- **Performance metrics** - Real-time FPS, frame time, CPU, RAM, GPU memory, instance counts
- **Remove instances** - Close button on each container
- **Color-coded types** - Green (ASTC), Blue (WebM), Purple (APNG), Orange (AVIF)

## Setup

### 1. Add test assets

Place your test files in `src/assets/`:
- `test.ktx2` - ASTC animation in KTX2 container
- `test_webm.webm` - WebM VP9+Alpha video
- `test_apng.apng` - Animated PNG
- `test_avif.avif` - Animated AVIF

### 2. Install dependencies

```bash
npm install
```

### 3. iOS Setup

```bash
cd ios && pod install && cd ..
```

### 4. Run

```bash
# iOS
npx react-native run-ios

# Android
npx react-native run-android
```

## Usage

1. Tap **+ ASTC** to spawn an ASTC GPU texture animation (green border)
2. Tap **+ WebM** to spawn a WebM VP9+Alpha video (blue border)
3. Tap **+ APNG** to spawn an animated PNG (purple border)
4. Tap **+ AVIF** to spawn an animated AVIF (orange border)
5. **Drag** animations by pressing and holding the ✋ grip icon
6. **Adjust z-index** with ▲/▼ buttons or type a number
7. **Remove** animations with the ✕ button
8. **Clear All** removes all instances

## Performance Metrics

The bottom panel shows:
- **FPS** - Frames per second (green = 55+, yellow = 30+, red = <30)
- **Frame** - Average frame time in milliseconds
- **CPU** - The app's CPU time across all threads as a share of the whole device (iOS/Android), with the average number of cores kept busy underneath (e.g. `1.8 / 8 cores`)
- **RAM** - App memory usage
- **GPU Mem** - GPU memory usage (when available)
- **Instance counts** - Number of each animation type

---

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
