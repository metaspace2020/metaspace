import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import svgLoader from 'vite-svg-loader'
import CompressionPlugin from 'vite-plugin-compression'
import Markdown from 'unplugin-vue-markdown/vite'

// const isCypressRun = process.env.CYPRESS_RUN === 'true';

// https://vitejs.dev/config/
// @ts-ignore
export default defineConfig(({ isSsrBuild }) => ({
  build: {
    sourcemap: true,
    assetsInlineLimit: 0,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
    // The SSR build is a throwaway bundle consumed by scripts/prerender.mjs;
    // it must not overwrite the browser build in dist/.
    ...(isSsrBuild
      ? {
          ssr: 'src/prerender/entry-server.tsx',
          outDir: 'dist-ssr',
          sourcemap: false,
          rollupOptions: {
            input: 'src/prerender/entry-server.tsx',
            output: {
              entryFileNames: 'entry-server.mjs',
              assetFileNames: `assets/[name].[ext]`,
            },
          },
        }
      : {}),
  },
  // Bundle every dependency into the SSR build rather than leaving them as
  // bare Node imports. Much of this tree is CommonJS or ships CSS side-effect
  // imports, neither of which Node can load from an ESM bundle on its own.
  ssr: {
    noExternal: true,
  },
  server: {
    host: true, // Equivalent to disableHostCheck: true in Webpack
    port: 8082,
    hmr: {
      overlay: false,
      // port: 8999  // Equivalent to sockPort in Webpack
    },
  },
  plugins: [
    vue({
      include: ['**/*.vue', '**/*.md'],
    }),
    vueJsx(),
    svgLoader(),
    // Browser build only - the SSR bundle is thrown away after the prerender.
    // sitemap.xml is written by scripts/prerender.mjs from the same route list
    // that drives the prerender, rather than by a plugin that crawls dist/.
    ...(isSsrBuild
      ? []
      : [
          CompressionPlugin({
            algorithm: 'brotliCompress',
            ext: '.br',
          }),
        ]),
    Markdown({
      headEnabled: true,
      markdownItOptions: {
        html: true,
        linkify: true,
        typographer: true,
      },
    }),
  ],
  css: {
    preprocessorOptions: {
      scss: { additionalData: `@import '@/modules/App/element-plus.scss';` },
    },
  },
  resolve: {
    alias: [
      // @ts-ignore
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      ...(isSsrBuild
        ? [
            {
              find: /^.*\/api\/graphqlClient$/,
              // @ts-ignore
              replacement: fileURLToPath(new URL('./src/prerender/graphqlClient.stub.ts', import.meta.url)),
            },
            {
              find: 'vue3-resize-directive',
              // @ts-ignore
              replacement: fileURLToPath(new URL('./src/prerender/resizeDirective.stub.ts', import.meta.url)),
            },
          ]
        : []),
    ],
  },
}))
