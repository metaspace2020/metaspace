import { config as testConfig } from '@vue/test-utils';
import Vue from 'vue';
import ElementUI from 'element-ui';
import registerMockComponent from './registerMockComponent';
import VueRouter from 'vue-router';

window.fetch = jest.fn();

testConfig.logModifiedComponents = false;

Vue.use(VueRouter);
Vue.use(ElementUI);
// Mock problematic ElementUI components
registerMockComponent('el-dialog');
registerMockComponent('el-popover');
registerMockComponent('el-autocomplete');
registerMockComponent('el-select');
registerMockComponent('el-option');
registerMockComponent('el-messagebox');

// Mock error reporting
jest.mock('../../src/lib/reportError', () => jest.fn(console.error));

// Prevent JWT requests
jest.mock('../../src/graphqlClient', () => require('./mockGraphqlClient'));

// Transitions throw errors because cssstyle doesn't support transition styles
registerMockComponent('transition');
registerMockComponent('transition-group');
