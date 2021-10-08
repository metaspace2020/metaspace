import { mount, Wrapper } from '@vue/test-utils'
import { Button, FormItem } from '../../../lib/element-ui'
import Vuex from 'vuex'
import Vue from 'vue'
import SignInDialog from './SignInDialog.vue'
import account from '../store/account'
import router from '../../../router'
import { restoreConsole, suppressConsoleWarn } from '../../../../tests/utils/suppressConsole'
import * as _mockAuthApi from '../../../api/auth'
import { refreshLoginStatus as _mockRefreshLoginStatus } from '../../../api/graphqlClient'

jest.mock('../../../api/auth')
const mockAuthApi = _mockAuthApi as jest.Mocked<typeof _mockAuthApi>

jest.mock('../../../api/graphqlClient')
const mockRefreshLoginStatus = _mockRefreshLoginStatus as jest.Mocked<typeof _mockRefreshLoginStatus>

Vue.use(Vuex)

const setFormField = (wrapper: Wrapper<Vue>, fieldName: string, value: string) => {
  wrapper
    .findAllComponents<FormItem>(FormItem)
    .filter((fi: Wrapper<FormItem>) => fi.props().prop === fieldName)
    .at(0)
    .find('input')
    .setValue(value)
}

describe('SignInDialog', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    suppressConsoleWarn('async-validator:')
  })

  afterEach(() => {
    restoreConsole()
  })

  const store = new Vuex.Store({
    modules: {
      account: account,
    },
  })

  it('should match snapshot', () => {
    const wrapper = mount(SignInDialog, { store, router })
    expect(wrapper).toMatchSnapshot()
  })

  it('should be able to sign in', async() => {
    // Arrange
    const email = 'test@example.com'
    const password = 'baz'
    const wrapper = mount(SignInDialog, { store, router }) as Wrapper<SignInDialog>
    mockAuthApi.signInByEmail.mockImplementation(() => Promise.resolve(true))
    store.commit('account/showDialog', 'signIn')

    // Act
    setFormField(wrapper, 'email', email)
    setFormField(wrapper, 'password', password)
    wrapper.findComponent(Button).trigger('click')
    await Vue.nextTick()

    // Assert
    expect(mockAuthApi.signInByEmail).toBeCalledWith(email, password)
    expect(mockRefreshLoginStatus).toBeCalled()
    expect(store.state.account.dialog).toBe(null)
  })
})
