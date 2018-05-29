const webpack = require('webpack');
const VueLoaderPlugin = require('vue-loader/lib/plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const derefSchema = require('./deref_schema');

derefSchema('src/assets/');

module.exports = {
  mode: 'development',
  entry: [
    'webpack-hot-middleware/client?path=/__webpack_hmr&timeout=20000',
    './src/main.ts'
  ],
  output: {
    path: '/',
    publicPath: '/dist/',
    filename: 'app.js',
    chunkFilename: 'app.[name].js'
  },
  module: {
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
          {loader: 'file-loader', options: { name: '[name].[ext]?[hash]' }}
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
  },
  resolve: {
    extensions: ['.ts', '.js', '.vue', '.json'],
    alias: {
      'vue$': 'vue/dist/vue.esm.js',
    }
  },
  devServer: {
    hot: true,
  },
  devtool: 'cheap-module-source-map',
  plugins: [
    new ForkTsCheckerWebpackPlugin({
      vue: true,
      workers: 2,
    }),
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'development')
      }
    }),
    new VueLoaderPlugin(),
    new webpack.HotModuleReplacementPlugin(),
    new webpack.NoEmitOnErrorsPlugin(),
  ]
};
