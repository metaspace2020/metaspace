const path = require('path');
const webpack = require('webpack');
const VueLoaderPlugin = require('vue-loader/lib/plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

   module.exports.output = {
    path: path.resolve(__dirname, './dist'),
    publicPath: '/dist/',
    filename: 'app.js',
    chunkFilename: '[name].js'
  };
module.exports.module = {
  rules: [
    {
      test: /\.vue$/,
      use: 'vue-loader'
    },
    {
      test: /\.ts$/,
      exclude: /node_modules/,
      use: [
        {
          loader: 'ts-loader',
          options: { appendTsSuffixTo: [/\.vue$/, /\.json$/], onlyCompileBundledFiles: true, transpileOnly: true }
        }
      ],
    },
    {
      test: /\.js$/,
      use: 'babel-loader',
      exclude: /node_modules/
    },
    {
      test: /\.(png|jpg|gif|svg)$/,
      use: [
        { loader: 'file-loader', options: { name: '[name].[ext]?[hash]' } }
      ],
    },
    {
      test: /\.css$/,
      use: ['vue-style-loader', 'css-loader']
    },
    {
      test: /\.scss$/,
      use: ['vue-style-loader', 'css-loader', 'postcss-loader', 'sass-loader']
    },
    {
      test: /\.(eot|ttf|woff|woff2)(\?\S*)?$/,
      use: 'file-loader'
    },
    {
      test: /\.md$/,
      use: ['html-loader', 'markdown-loader']
    },
    {
      test: /\.tour/,
      use: ['json-loader', './loaders/tour-loader.js']
    }
  ]
};
module.exports.resolve = {
  extensions: ['.ts', '.js', '.vue', '.json']
};
module.exports.optimization = {
  noEmitOnErrors: true,
  splitChunks: {
    cacheGroups: {
      vendor: {
        name: 'vendor.bundle',
        test: /[\\/]node_modules[\\/]/,
        chunks: 'initial'
      },
      vendors: false,
      default: {
        priority: -20,
        reuseExistingChunk: true
      }
    }
  }
};
module.exports.plugins = [
  new VueLoaderPlugin(),
  new ForkTsCheckerWebpackPlugin({
    vue: true,
    workers: 2,
  }),
];

