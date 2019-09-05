const {ProgressPlugin} = require('webpack');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
module.exports = {
  parallel: 2,
  configureWebpack: config => {
    config.module.rules.push({
      test: /\.md$/,
      use: ['frontmatter-markdown-loader']
    });

    config.plugins = config.plugins.filter(p => !(p instanceof ProgressPlugin));
    config.plugins.find(p => p instanceof ForkTsCheckerWebpackPlugin).workersNumber = 3;

    if (process.env.NODE_ENV === 'production') {
      // mutate config for production...
    } else {
      // mutate for development...
    }
  }
}
