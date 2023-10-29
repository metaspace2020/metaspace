const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  // transpileDependencies: true
  parallel: 3,
  indexPath: 'index.html',

  // assetsDir: '../static',
  devServer: {
    allowedHosts: 'all', // For running behind nginx
    port: 8082,
    client: {
      webSocketURL: 'ws://0.0.0.0:8999',
    },
  },

})
