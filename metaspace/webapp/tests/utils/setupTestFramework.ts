import * as VueTestUtils from '@vue/test-utils';
import Vue from 'vue';
import ElementUI from 'element-ui';
import registerMockComponent from './registerMockComponent';
import VueRouter from 'vue-router';
import registerMockDirective from './registerMockDirective';
import {Wrapper} from '@vue/test-utils';

window.fetch = jest.fn();

VueTestUtils.config.logModifiedComponents = false;

Vue.use(VueRouter);
Vue.use(ElementUI);
// Mock problematic ElementUI components
registerMockComponent('el-dialog');
registerMockComponent('el-popover');
registerMockComponent('el-tooltip');
registerMockComponent('el-autocomplete');
registerMockComponent('el-select');
registerMockComponent('el-option');
registerMockComponent('el-messagebox');
registerMockComponent('el-dropdown');
registerMockComponent('el-dropdown-menu');
registerMockComponent('el-dropdown-item');

// Mock problematic directives
registerMockDirective('loading');

// Mock error reporting
jest.mock('../../src/lib/reportError', () => jest.fn(console.error));

// Prevent JWT requests
jest.mock('../../src/graphqlClient', () => require('./mockGraphqlClient'));

// Transitions throw errors because cssstyle doesn't support transition styles
registerMockComponent('transition', {abstract: true}); //  ElTreeNode relies on Transition being abstract
registerMockComponent('transition-group');

// Ignore delay duration
jest.mock('../../src/lib/delay', () => jest.fn(() => Promise.resolve()));

// Track all components mounted by vue-test-utils and automatically clean them up after each test to prevent stale
// components from updating due to e.g. route changes
const mockWrappers: Wrapper<Vue>[] = [];
jest.mock('@vue/test-utils', () => {
  const wrapVueTestToolsFunction = (originalFunc: ((...args: any[]) => Wrapper<Vue>)) => {
    return function(...args: any[]) {
      const wrapper = originalFunc(...args);
      mockWrappers.push(wrapper);
      return wrapper;
    }
  };
  const actual = require.requireActual('@vue/test-utils');
  return Object.assign({}, actual, {
    mount: wrapVueTestToolsFunction(actual.mount),
    shallowMount: wrapVueTestToolsFunction(actual.shallowMount),
  });
});

afterEach(() => {
  while (mockWrappers.length > 0) {
    mockWrappers.pop()!.destroy();
  }
});
