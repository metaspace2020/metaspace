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
export function setupGlobalStubs() {
  const ElOptionMock = {
    name: 'ElOptionMock',
    template: '<div class="mock-el-option"><slot></slot></div>',
    props: ['groupQueryChange'], // Add props used by the original component
    // inject: ['ElSelect'], // Mock the injection used by the real component
  };

  const ElSelectMock = {
    name: 'ElSelectMock',
    template: '<div class="mock-el-select"><slot></slot></div>',
  };

  const ElOptionGroupMock = {
    name: 'ElOptionGroupMock',
    template: '<div class="mock-el-option-group"><slot></slot></div>',
  };

  const ElIconMock = {
    name: 'ElIconMock',
    template: '<div class="mock-el-icon"><slot></slot></div>',
  };
  const ElPopoverMock = {
    name: 'ElPopoverMock',
    template: '<div class="mock-el-popover"><slot></slot></div>',
  };
  const ElTooltipMock = {
    name: 'ElTooltipMock',
    template: '<div class="mock-el-tooltip"><slot></slot></div>',
  };
  const ElDropdownMock = {
    name: 'ElDropdownMock',
    template: '<div class="mock-el-dropdown"><slot></slot></div>',
  };

  const RouterLinkMock = {
    template: '<div><slot></slot></div>',
    props: ['to'],
  };

  config.global.stubs = {
    'el-option': ElOptionMock,
    'el-dropdown': ElDropdownMock,
    'el-select': ElSelectMock,
    'el-option-group': ElOptionGroupMock,
    'el-icon': ElIconMock,
    'el-popover': ElPopoverMock,
    'el-tooltip': ElTooltipMock,
    RouterLink: RouterLinkMock,
  };
}


// Polyfill fetch if it's not already available in the global environment
if (!global.fetch) {
  // @ts-ignore
  global.fetch = fetch;
}

// mock new jwt token
// @ts-ignore
global.fetch = vi.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ token: 'mock-token' }),
  })
);

vi.mock('element-plus', async() => {
  const originalModule : any = await vi.importActual('element-plus');
  return {
    ...originalModule,
    generateId: () => 'fixed-id',
  };
});


vi.mock('vue', async () => {
  const actualVue : any = await vi.importActual('vue');

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
  // setupGlobalPlugins()
  setupGlobalStubs()
  // @ts-ignore
  global.window.scrollTo = vi.fn();
});


// Track unhandled rejections
const unhandledRejections = new Map();
process.on('unhandledRejection', (reason, promise) => {
  // console.error('Unhandled rejection', promise, 'reason:', reason);
  unhandledRejections.set(promise, reason);
});
process.on('rejectionHandled', (promise) => {
  unhandledRejections.delete(promise);
});


afterAll(() => {
  // Cleanup after all tests have run
  // Check for unhandled rejections and fail the test if any are found
  if (unhandledRejections.size > 0) {
    throw new Error(`Unhandled promise rejections: ${Array.from(unhandledRejections.values()).join(', ')}`);
  }
});


afterEach(() => {
  // vi.clearAllMocks();
});
