import { mount, config as testConfig } from '@vue/test-utils';
import VueRouter from 'vue-router';
import ElementUI from 'element-ui';
import Vue from 'vue';
import MetadataEditor from './MetadataEditor.vue';
import router from '../../router';
import registerMockComponent from '../../../tests/utils/registerMockComponent';
import { restoreConsole, suppressConsoleWarn } from '../../../tests/utils/suppressConsole';
import { initMockGraphqlClient, provide } from '../../../tests/utils/mockGraphqlClient';
import store from '../../store';

Vue.use(ElementUI);
registerMockComponent('el-dialog'); // ElDialogs mount their content somewhere else in the DOM. Mock it out so that the snapshot includes the content.
registerMockComponent('el-popover');
registerMockComponent('el-autocomplete');
registerMockComponent('el-select');
registerMockComponent('el-option');
Vue.use(VueRouter);


describe('MetadataEditor', () => {
  beforeAll(async () => {
    await initMockGraphqlClient();
    testConfig.logModifiedComponents = false;
    store.replaceState({
      ...store.state,
      route: { path: '/upload', query: {} }
    })
  });

  beforeEach(() => {
    jest.resetAllMocks();
    suppressConsoleWarn('async-validator:');
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    restoreConsole();
  });

  it('should match snapshot', async () => {
    const wrapper = mount(MetadataEditor, { store, router, provide, sync: false });
    await (wrapper.vm as any).loadingPromise;
    await Vue.nextTick();

    expect(wrapper).toMatchSnapshot();
  });
});
