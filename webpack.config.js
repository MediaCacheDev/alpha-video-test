const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { writeMediaIndex } = require('./scripts/media-index');

const mediaFiles = writeMediaIndex();

const appDirectory = path.resolve(__dirname);

// The production build ships only the media the catalog names, less WEB_MEDIA_SKIP (comma-separated
// file names; the hosted demo leaves out the 839 MB raw ASTC manta). It lists them in its own index,
// so a running Metro keeps seeing src/media.generated.json unchanged.
const catalogFiles = new Set(
  [...fs.readFileSync(path.resolve(appDirectory, 'src/catalog.ts'), 'utf8').matchAll(/media\('([^']+)'\)/g)].map(m => m[1]),
);
const skippedFiles = (process.env.WEB_MEDIA_SKIP || '').split(',').filter(Boolean);
const shippedFiles = mediaFiles.filter(f => catalogFiles.has(f) && !skippedFiles.includes(f));
const shippedIndex = path.resolve(appDirectory, 'node_modules/.cache/media.web.json');

// Babel loader configuration
const babelLoaderConfiguration = {
  test: /\.(js|jsx|ts|tsx)$/,
  include: [
    path.resolve(appDirectory, 'index.web.js'),
    path.resolve(appDirectory, 'App.tsx'),
    path.resolve(appDirectory, 'src'),
    // Include react-native-web
    path.resolve(appDirectory, 'node_modules/react-native-web'),
    // Include react-native packages that need transpiling
    path.resolve(appDirectory, 'node_modules/react-native-alpha-video-gpu'),
    path.resolve(appDirectory, 'node_modules/react-native-alpha-video-ffmpegkit'),
    path.resolve(appDirectory, 'node_modules/react-native-alpha-video'),
    path.resolve(appDirectory, 'node_modules/react-native-apng-avif'),
    path.resolve(appDirectory, 'node_modules/react-native-safe-area-context'),
  ],
  use: {
    loader: 'babel-loader',
    options: {
      cacheDirectory: true,
      presets: [
        ['@babel/preset-env', { targets: { browsers: ['last 2 versions'] } }],
        ['@babel/preset-react', { runtime: 'automatic' }],
        '@babel/preset-typescript',
      ],
      plugins: [
        'react-native-web',
      ],
    },
  },
};

// Image loader configuration
const imageLoaderConfiguration = {
  test: /\.(gif|jpe?g|png|svg)$/,
  type: 'asset/resource',
};

module.exports = (env, argv) => {
  const production = argv.mode === 'production';
  if (production) {
    fs.mkdirSync(path.dirname(shippedIndex), { recursive: true });
    fs.writeFileSync(shippedIndex, `${JSON.stringify({ files: shippedFiles }, null, 2)}\n`);
  }

  return {
    entry: path.resolve(appDirectory, 'index.web.js'),
    output: {
      filename: 'bundle.[contenthash].js',
      path: path.resolve(appDirectory, 'dist'),
      clean: true,
    },
    resolve: {
      extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.js'],
      alias: {
        'react-native$': 'react-native-web',
      },
    },
    module: {
      rules: [
        babelLoaderConfiguration,
        imageLoaderConfiguration,
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(appDirectory, 'web/index.html'),
      }),
      ...(production ? [new webpack.NormalModuleReplacementPlugin(/media\.generated\.json$/, shippedIndex)] : []),
      // The players resolve asset://media/x to /media/x on the web.
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(appDirectory, 'assets'),
            filter: file => !production || shippedFiles.includes(path.basename(file)),
            noErrorOnMissing: true,
          },
          // At the root, so its scope is the whole app
          {
            from: path.resolve(appDirectory, 'node_modules/range-source-web/dist/range-source-sw.js'),
            noErrorOnMissing: true,
          },
        ],
      }),
    ],
    devServer: {
      static: [
        { directory: path.resolve(appDirectory, 'dist') },
        { directory: path.resolve(appDirectory, 'assets'), publicPath: '/' },
      ],
      hot: true,
      port: 8080,
      open: true,
      historyApiFallback: true,
    },
    performance: {
      hints: false,
    },
  };
};
