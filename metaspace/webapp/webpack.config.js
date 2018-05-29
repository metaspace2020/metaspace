const path = require('path');
const webpack = require('webpack');
const VueLoaderPlugin = require('vue-loader/lib/plugin');
const derefSchema = require('./deref_schema');

derefSchema('src/assets/');

module.exports = {
  mode: 'production',
  entry: {
    app: ['./src/main.ts'],
    vendor: ['vue', 'vuex', 'vue-router', 'vuex-router-sync',
             'vue-apollo', 'apollo-client', 'graphql-tag',
             'element-ui', 'd3', 'lodash'
    ]
  },
  output: {
    path: path.resolve(__dirname, './dist'),
    publicPath: '/dist/',
    filename: 'app.js'
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
          {loader: 'ts-loader', options: { appendTsSuffixTo: [/\.vue$/, /\.json$/] }}
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
      'vue$': 'vue/dist/vue.esm.js'
    }
  },
  devServer: {
    historyApiFallback: true,
    noInfo: true
  },
  devtool: 'source-map',
  plugins: [
    // TODO: HTML changes needed for this
    new webpack.optimize.SplitChunksPlugin(),
    // TODO: Does this do anything?
    new webpack.LoaderOptionsPlugin({
      minimize: true
    }),
    new VueLoaderPlugin()
  ]
};

