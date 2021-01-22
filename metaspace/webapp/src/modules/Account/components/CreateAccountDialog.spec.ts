import { mount, Wrapper } from '@vue/test-utils'
import { Button, FormItem } from '../../../lib/element-ui'
import Vuex from 'vuex'
import Vue from 'vue'
import CreateAccountDialog from './CreateAccountDialog.vue'
import account from '../store/account'
import router from '../../../router'
import { restoreConsole, suppressConsoleWarn } from '../../../../tests/utils/suppressConsole'
import * as _mockAuthApi from '../../../api/auth'

jest.mock('../../../api/auth')
const mockAuthApi = _mockAuthApi as jest.Mocked<typeof _mockAuthApi>

Vue.use(Vuex)

const setFormField = (wrapper: Wrapper<Vue>, fieldName: string, value: string) => {
  wrapper
    .findAllComponents<FormItem>(FormItem)
    .filter((fi: Wrapper<FormItem>) => fi.props().prop === fieldName)
    .at(0)
    .find('input')
    .setValue(value)
}

describe('CreateAccountDialog', () => {
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
    const wrapper = mount(CreateAccountDialog, { store, router })
    expect(wrapper).toMatchSnapshot()
  })

  it('should be able to submit a valid form', async() => {
    // Arrange
    const firstName = 'foo'
    const lastName = 'bar'
    const email = 'test@example.com'
    const password = 'abcd1234'
    const wrapper = mount(CreateAccountDialog, { store, router }) as Wrapper<CreateAccountDialog>

    // Act
    setFormField(wrapper, 'firstName', firstName)
    setFormField(wrapper, 'lastName', lastName)
    setFormField(wrapper, 'email', email)
    setFormField(wrapper, 'password', password)
    wrapper.findComponent(Button).trigger('click')
    await Vue.nextTick()

    // Assert
    expect(mockAuthApi.createAccountByEmail).toBeCalledWith(email, password, `${firstName} ${lastName}`)
    expect(wrapper.text()).toEqual(expect.stringContaining('Please click the link'))
  })

  it('should not submit an invalid form', async() => {
    // Arrange
    const wrapper = mount(CreateAccountDialog, { store, router }) as Wrapper<CreateAccountDialog>

    // Act
    setFormField(wrapper, 'firstName', 'foo')
    setFormField(wrapper, 'lastName', 'bar')
    setFormField(wrapper, 'email', 'test@email.com')
    setFormField(wrapper, 'password', '') // Intentionally left empty
    wrapper.findComponent(Button).trigger('click')
    await Vue.nextTick()

    // Assert
    expect(mockAuthApi.createAccountByEmail).not.toBeCalled()
  })
})
