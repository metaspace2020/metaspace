import { mount } from '@vue/test-utils';
import VueRouter from 'vue-router';
import ElementUI from 'element-ui';
import Vuex from 'vuex';
import Vue from 'vue';
import CreateAccountDialog from './CreateAccountDialog.vue';
import accountModule from '../../store/accountModule';
import router from '../../router';
import registerMockComponent from '../../../tests/utils/registerMockComponent';

Vue.use(ElementUI);
registerMockComponent('el-dialog');
Vue.use(VueRouter);
Vue.use(Vuex);

describe('CreateAccountDialog', () => {

  const store = new Vuex.Store({
    modules: {
      account: accountModule
    }
  });

  it('should match snapshot', () => {
    const wrapper = mount(CreateAccountDialog, { store, router });
    expect(wrapper).toMatchSnapshot();
  });
});
