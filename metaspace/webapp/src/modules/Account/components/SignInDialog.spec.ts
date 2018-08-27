import { mount, Wrapper } from '@vue/test-utils';
import ElementUI from 'element-ui';
import Vuex from 'vuex';
import Vue from 'vue';
import SignInDialog from './SignInDialog.vue';
import account from '../store/account';
import router from '../../../router';
import { restoreConsole, suppressConsoleWarn } from '../../../../tests/utils/suppressConsole';

jest.mock('../../../api/auth');
import * as _mockAuthApi from '../../../api/auth';
const mockAuthApi = _mockAuthApi as jest.Mocked<typeof _mockAuthApi>;

jest.mock('../../../graphqlClient');
import {refreshLoginStatus as _mockRefreshLoginStatus} from '../../../graphqlClient';
const mockRefreshLoginStatus = _mockRefreshLoginStatus as jest.Mocked<typeof _mockRefreshLoginStatus>;

Vue.use(Vuex);

const setFormField = (wrapper: Wrapper<Vue>, fieldName: string, value: string) => {
  wrapper
    .findAll(ElementUI.FormItem)
    .filter((fi: Wrapper<ElementUI.FormItem>) => fi.props().prop === fieldName)
    .at(0)
    .find('input')
    .setValue(value);
};

describe('SignInDialog', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    suppressConsoleWarn('async-validator:');
  });

  afterEach(() => {
    restoreConsole();
  });

  const store = new Vuex.Store({
    modules: {
      account: account,
    },
  });

  it('should match snapshot', () => {
    const wrapper = mount(SignInDialog, { store, router });
    expect(wrapper).toMatchSnapshot();
  });

  it('should be able to sign in', async () => {
    // Arrange
    const email = 'test@example.com';
    const password = 'baz';
    const wrapper = mount(SignInDialog, { store, router, sync: false }) as Wrapper<SignInDialog>;
    mockAuthApi.signInByEmail.mockImplementation(() => Promise.resolve(true));
    store.commit('account/showDialog', 'signIn');

    // Act
    setFormField(wrapper, 'email', email);
    setFormField(wrapper, 'password', password);
    wrapper.find(ElementUI.Button).trigger('click');
    await Vue.nextTick();

    // Assert
    expect(mockAuthApi.signInByEmail).toBeCalledWith(email, password);
    expect(mockRefreshLoginStatus).toBeCalled();
    expect(store.state.account.dialog).toBe(null);
  });
});
