var path = require('path');
var webpack = require('webpack');


module.exports = {
  entry: {
    app: ['./src/main.ts'],
    vendor: ['ajv', 'vue', 'vuex', 'vue-router', 'vuex-router-sync',
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
        loader: 'vue-loader',
        options: {
          loaders: {
            // Since sass-loader (weirdly) has SCSS as its default parse mode, we map
            // the "scss" and "sass" values for the lang attribute to the right configs here.
            // other preprocessors should work out of the box, no loader config like this nessessary.
            'scss': 'vue-style-loader!css-loader!postcss-loader!sass-loader',
            'sass': 'vue-style-loader!css-loader!postcss-loader!sass-loader?indentedSyntax',
            'less': 'vue-style-loader!css-loader!postcss-loader!less-loader',
            'js': 'babel-loader'
          },
          esModule: true
        }
      },
      {
        test: /\.(t|j)s$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
        options: {
          appendTsSuffixTo: [/\.vue$/, /\.json$/],
        }
      },
      {
        test: /\.(png|jpg|gif|svg)$/,
        loader: 'file-loader',
        options: {
          name: '[name].[ext]?[hash]'
        }
      },
      {
          test: /\.css$/,
          loader: 'style-loader!css-loader'
      },
      {
          test: /\.scss$/,
          loader: 'style-loader!css-loader!sass-loader'
      },
      {
          test: /\.(eot|svg|ttf|woff|woff2)(\?\S*)?$/,
          loader: 'file-loader'
      },
      {
          test: /\.md$/,
          loader: 'html-loader!markdown-loader'
      },
      {
        test: /\.tour/,
        loader: 'json-loader!./loaders/tour-loader.js'
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
  devtool: '#eval-source-map',
  plugins: [
    new webpack.optimize.CommonsChunkPlugin({
      name: "vendor",
      filename: "vendor.bundle.js"
    })
  ]
}

if (process.env.NODE_ENV === 'production') {
  module.exports.devtool = '#source-map'
  // http://vue-loader.vuejs.org/en/workflow/production.html
  module.exports.plugins = (module.exports.plugins || []).concat([
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: '"production"'
      }
    }),
    new webpack.optimize.UglifyJsPlugin({
      sourceMap: true,
      compress: {
        warnings: false
      }
    }),
    new webpack.LoaderOptionsPlugin({
      minimize: true
    })
  ])
}
