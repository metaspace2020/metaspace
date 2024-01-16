import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import svgLoader from 'vite-svg-loader'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import CompressionPlugin from 'vite-plugin-compression'

// const isCypressRun = process.env.CYPRESS_RUN === 'true';

// https://vitejs.dev/config/
// @ts-ignore
export default defineConfig({
  build: {
    sourcemap: true,
    assetsInlineLimit: 0,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`
      }
    }
  },
  server: {
    host: true,   // Equivalent to disableHostCheck: true in Webpack
    port: 8082,
    hmr: {
      overlay: false,
      // port: 8999  // Equivalent to sockPort in Webpack
    },
  },
  plugins: [
    vue(),
    vueJsx(),
    svgLoader(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
    CompressionPlugin({
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
  ],
  css: {
    preprocessorOptions: {
      scss: { additionalData: `@import '@/modules/App/element-plus.scss';` },
    }
  },
  resolve: {
    alias: { // @ts-ignore
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
