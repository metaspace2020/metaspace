const webpack = require('webpack');
const derefSchema = require('./deref_schema');
const {output, module: {rules}, resolve, optimization, plugins} = require('./webpack.common');

derefSchema('src/assets/');

module.exports = {
  mode: 'production',
  entry: {
    app: './src/main.ts'
  },
  output,
  module: {
    rules
  },
  resolve,
  optimization,
  devtool: 'source-map',
  plugins: [
    ...plugins,
    new webpack.LoaderOptionsPlugin({
      minimize: true
    })
  ]
};

