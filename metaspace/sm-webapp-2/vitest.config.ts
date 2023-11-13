/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import virtual from 'vite-plugin-virtual'
import {fileURLToPath, URL} from "node:url";
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import AutoImport from 'unplugin-auto-import/vite'


export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    virtual({
      // Stubbing a CSS module
      'styles.css': 'export default {}',
      // Stubbing an image import
      'image.jpg': 'export default ""',
    }),
    AutoImport({
      imports: ['vitest'],
      dts: 'src/auto-imports.d.ts', // generates a .d.ts file with the types
    }),
  ],
  test: {
    globals: true,
    setupFiles: 'src/tests/setupTests.ts',
    environment: 'jsdom',
  },
  resolve: {
    alias: { // @ts-ignore
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
