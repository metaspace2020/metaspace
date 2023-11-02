/// <reference types="vitest" />
import { defineConfig } from 'vite'
import virtual from 'vite-plugin-virtual'
import {fileURLToPath, URL} from "node:url";
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'


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
