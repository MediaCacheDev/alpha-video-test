const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const appDirectory = path.resolve(__dirname);

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

module.exports = {
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
    // The players resolve asset://media/x to /media/x on the web.
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(appDirectory, 'assets'),
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
