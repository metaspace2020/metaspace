const { ProgressPlugin } = require('webpack')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')
const CompressionWebpackPlugin = require('compression-webpack-plugin')

module.exports = {
  parallel: 3,
  indexPath: 'index.html',

  // assetsDir: '../static',
  devServer: {
    disableHostCheck: true, // For running behind nginx
    port: 8082,
    sockPort: 8888,
    progress: false, // To avoid spamming the docker logs with CLI progress updates
  },
  /**
   *
   * @param config {import('webpack-chain')}
   */
  chainWebpack: config => {
    config.module
      .rule('vue')
      .use('vue-loader')
      .loader('vue-loader')
      .tap(options => ({
        ...options,
        compilerOptions: {
          ...options.compilerOptions,
          whitespace: 'preserve',
        }
      }))
  },

  configureWebpack: (config) => {
    const svgRules = config.module.rules.find(_ => _.test.toString().includes('svg'))
    svgRules.oneOf.unshift({
      use: [
        { loader: 'babel-loader' },
        { loader: 'vue-svg-loader' }
      ],
      include: /(assets\/inline)/
    })

    config.module.rules.push({
      test: /\.md$/,
      use: ['frontmatter-markdown-loader'],
    })

    config.plugins = config.plugins.filter(p => !(p instanceof ProgressPlugin))
    config.plugins.find(p => p instanceof ForkTsCheckerWebpackPlugin).workersNumber = 3

    if (process.env.WEBPACK_STATS) {
      const StatsPlugin = require('stats-webpack-plugin')
      config.plugins.push(new StatsPlugin('stats.json'))
    }

    if (process.env.NODE_ENV === 'production') {
      const compressionTest = /\.(js|css|json|txt|html|ico|svg)(\?.*)?$/i
      config.plugins.push(
        new CompressionWebpackPlugin({
          test: compressionTest,
          minRatio: 0.9,
        }),
        // new BrotliPlugin({
        //   test: compressionTest,
        //   minRatio: 0.9
        // })
      )
    } else {
      // mutate for development...
    }
  },
  pluginOptions: {
    apollo: {
      lintGQL: true,
    },
  },
  lintOnSave: 'warning'
}
