// src/setupTests.ts
import { afterAll, beforeAll, vi } from 'vitest';
import fetch from 'node-fetch';
import svgMock from './mockSvg';

import { config } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// Assuming you're using `setupGlobalPlugins` as a custom setup function
export function setupGlobalPlugins() {
  config.global.plugins.push([ElementPlus])
}

// Polyfill fetch if it's not already available in the global environment
if (!global.fetch) {
  // @ts-ignore
  global.fetch = fetch;
}

vi.mock('vue', async () => {
  const actualVue = await vi.importActual('vue');

  return {
    ...actualVue,
    defineAsyncComponent: (loader) => {
      // Use a dummy component for SVG imports
      if (loader.toString().includes('.svg')) {
        return svgMock;
      }
      // Otherwise, use the actual `defineAsyncComponent`
      return actualVue.defineAsyncComponent(loader);
    },
  };
});

// Set up any global hooks or utilities for Apollo or Vue Testing
beforeAll(() => {
  // Setup before all tests run, e.g., initializing Apollo Client
  setupGlobalPlugins()
});

afterAll(() => {
  // Cleanup after all tests have run
  // Check for unhandled rejections and fail the test if any are found
  if (unhandledRejections.size > 0) {
    throw new Error(`Unhandled promise rejections: ${Array.from(unhandledRejections.values()).join(', ')}`);
  }
});


// Track unhandled rejections
const unhandledRejections = new Map();
process.on('unhandledRejection', (reason, promise) => {
  unhandledRejections.set(promise, reason);
});
process.on('rejectionHandled', (promise) => {
  unhandledRejections.delete(promise);
});
