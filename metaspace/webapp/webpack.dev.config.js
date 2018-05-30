const webpack = require('webpack');
const {output, module: {rules}, resolve, optimization, plugins} = require('./webpack.common');
const derefSchema = require('./deref_schema');

derefSchema('src/assets/');

module.exports = {
  mode: 'development',
  entry: [
    'webpack-hot-middleware/client?path=/__webpack_hmr&timeout=20000',
    './src/main.ts'
  ],
  output,
  module: {
    rules
  },
  resolve,
  optimization,
  devServer: {
    hot: true,
    publicPath: output.publicPath,
    noInfo: true,
    stats: {
      all: false,
      builtAt: true,
      colors: true,
      errors: true,
      errorDetails: true,
      warnings: true,
    },
  },
  devtool: 'cheap-module-source-map',
  plugins: [
    ...plugins,
    new webpack.HotModuleReplacementPlugin(),
  ]
};
