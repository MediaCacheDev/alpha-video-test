const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    assetExts: [...getDefaultConfig(__dirname).resolver.assetExts, 'ktx2', 'glb', 'webm', 'apng', 'avif', 'zst', 'astv'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
