import {flushPromises, mount} from '@vue/test-utils';
import { createRouter, createWebHistory } from 'vue-router';
import { createStore } from 'vuex';
import { beforeEach, afterEach, vi } from 'vitest';
import ElementPlus from 'element-plus';
import CreateAccountDialog from './CreateAccountDialog.vue';
import account from '../store/account';
import { nextTick } from 'vue';
import * as authApi from '../../../api/auth';

vi.mock('../../../api/auth');

// Create a router instance
const localRouter = createRouter({
  history: createWebHistory(),
  routes: [], // Define your routes here
});

const setFormField = (wrapper, fieldName, value) => {
  const formItem = wrapper.findAllComponents({ name: 'ElFormItem' }).find(w => w.props().prop === fieldName);
  formItem.find('input').setValue(value);
};

describe('CreateAccountDialog', () => {
  let store;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createStore({
      modules: {
        account: account,
      },
    });
  });

  afterEach(() => {
    // Clean up or restore any global changes here
    // For example, if you had mocked global functions or properties
  });

  it('should match snapshot', async ({expect}) => {
    const wrapper = mount(CreateAccountDialog, {
      global: {
        plugins: [store, localRouter, ElementPlus],
      },
    });
    await nextTick();
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('should be able to submit a valid form', async ({expect}) => {
    // Import the mocked module

    // Arrange
    const firstName = 'foo';
    const lastName = 'bar';
    const email = 'test@example.com';
    const password = 'abcd1234';
    const wrapper = mount(CreateAccountDialog, {
      global: {
        plugins: [store, localRouter, ElementPlus],
      },
    });
    await nextTick();

    // Act
    setFormField(wrapper, 'firstName', firstName);
    setFormField(wrapper, 'lastName', lastName);
    setFormField(wrapper, 'email', email);
    setFormField(wrapper, 'password', password);
    await wrapper.vm.form?.validate();

    await wrapper.find('[data-testid="submit-btn"]').trigger('click');
    await flushPromises()
    await nextTick();

    // Assert
    expect(authApi.createAccountByEmail).toHaveBeenCalledTimes(1);
    const paragraph = wrapper.find('p');
    expect(paragraph.text()).toContain('Please click the link');
  });

  it('should not submit an invalid form', async ({expect}) => {
    // Arrange
    const wrapper = mount(CreateAccountDialog, {
      global: {
        plugins: [store, localRouter, ElementPlus],
      },
    });
    await nextTick();

    // Act
    setFormField(wrapper, 'firstName', 'foo');
    setFormField(wrapper, 'lastName', 'bar');
    setFormField(wrapper, 'email', 'test@email.com');
    setFormField(wrapper, 'password', ''); // Intentionally left empty
    await wrapper.vm.form?.validate();
    await nextTick();

    await wrapper.find('[data-testid="submit-btn"]').trigger('click');

    // await flushPromises()
    await nextTick();

    // Assert
    expect(authApi.createAccountByEmail).not.toBeCalled();
  });
});
