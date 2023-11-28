import {flushPromises, mount} from '@vue/test-utils';
import { createStore } from 'vuex';
import { beforeEach, afterEach, vi } from 'vitest';
import ElementPlus from 'element-plus';
import SignInDialog from './SignInDialog.vue';
import account from '../store/account';
import {nextTick} from "vue";
import * as authApi from '../../../api/auth';
import { refreshLoginStatus } from '../../../api/graphqlClient';
import router from "@/router";

vi.mock('../../../api/auth', () => ({
  signInByEmail: vi.fn(),
}));
vi.mock('../../../api/graphqlClient', () => ({
  refreshLoginStatus: vi.fn().mockResolvedValue(undefined),
  // ...mock other exports if needed
}));

// Create a Vuex store and Vue Router instance
const store = createStore({
  modules: {
    account: account,
  },
});

// const router = createRouter({
//   history: createWebHistory(),
//   routes: [], // Define your routes here
// });

const setFormField = (wrapper, fieldName, value) => {
  const formItem = wrapper.findAllComponents({ name: 'ElFormItem' }).find(w => w.props().prop === fieldName);
  formItem.find('input').setValue(value);
};

describe('SignInDialog', () => {
  beforeEach(() => {
    // @ts-ignore
    authApi.signInByEmail.mockImplementation(async (email, password) => {
      if (email === 'test@example.com' && password === 'baz') {
        return true;
      }
      return false;
    });
  });

  afterEach(() => {
    // Clean up or restore any global changes here
  });

  it('should match snapshot', async ({expect}) => {
    const wrapper = mount(SignInDialog, {
      global: {
        plugins: [store, router, ElementPlus],
      },
    });

    await nextTick();
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('should be able to sign in', async ({expect}) => {
    // Arrange
    const email = 'test@example.com';
    const password = 'baz';
    const wrapper = mount(SignInDialog, {
      global: {
        plugins: [store, router, ElementPlus],
      },
    });
    await nextTick();
    await nextTick();

    // Act
    setFormField(wrapper, 'email', email);
    setFormField(wrapper, 'password', password);
    await wrapper.vm.form?.validate();

    await wrapper.find('[data-testid="submit-btn"]').trigger('click');
    await flushPromises()
    await nextTick();

    // Assert
    expect(authApi.signInByEmail).toBeCalledWith(email, password);
    expect(refreshLoginStatus).toBeCalled();
    expect(store.state.account.dialog).toBe(null);
  });
});
