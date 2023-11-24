// src/setupTests.ts
import { afterAll, beforeAll, vi, afterEach, expect } from 'vitest';
import fetch from 'node-fetch';
import svgMock from './mockSvg';
import { customSerializer } from './customSerializer';
import { config } from '@vue/test-utils'
import ElementPlus from 'element-plus'


expect.addSnapshotSerializer(customSerializer);


// Assuming you're using `setupGlobalPlugins` as a custom setup function
export function setupGlobalPlugins() {
  config.global.plugins.push([ElementPlus])
}


// Polyfill fetch if it's not already available in the global environment
if (!global.fetch) {
  // @ts-ignore
  global.fetch = fetch;
}

// mock new jwt token
global.fetch = vi.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ token: 'mock-token' }),
  })
);

vi.mock('element-plus', async() => {
  const originalModule = await vi.importActual('element-plus');
  return {
    ...originalModule,
    generateId: () => 'fixed-id',
  };
});


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


afterEach(() => {
  vi.clearAllMocks();
});


// Track unhandled rejections
const unhandledRejections = new Map();
process.on('unhandledRejection', (reason, promise) => {
  unhandledRejections.set(promise, reason);
});
process.on('rejectionHandled', (promise) => {
  unhandledRejections.delete(promise);
});
