import { flushPromises, mount } from '@vue/test-utils'
import { createStore } from 'vuex'
import { beforeEach, afterEach, vi } from 'vitest'
import ElementPlus from '../../../lib/element-plus'
import CreateAccountDialog from './CreateAccountDialog.vue'
import account from '../store/account'
import { nextTick } from 'vue'
import * as authApi from '../../../api/auth'
import router from '../../../router'

vi.mock('../../../api/auth', () => ({
  createAccountByEmail: vi.fn(() => Promise.resolve()),
}))

const setFormField = (wrapper, fieldName, value) => {
  const formItem = wrapper.findAllComponents({ name: 'ElFormItem' }).find((w) => w.props().prop === fieldName)
  formItem.find('input').setValue(value)
}

describe('CreateAccountDialog', () => {
  let store

  beforeEach(() => {
    store = createStore({
      modules: {
        account: account,
      },
    })
  })

  afterEach(() => {
    vi.clearAllMocks() // Clears all mocks to prevent test leakage
    vi.resetModules() // Reset any module state, very useful when modules have side effects
  })

  it('should match snapshot', async () => {
    const wrapper = mount(CreateAccountDialog, {
      global: {
        plugins: [store, router, ElementPlus],
      },
    })
    await nextTick()
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('should be able to submit a valid form', async () => {
    const firstName = 'foo'
    const lastName = 'bar'
    const email = 'test@example.com'
    const password = 'abcd1234'
    const wrapper = mount(CreateAccountDialog, {
      global: {
        plugins: [store, router, ElementPlus],
      },
    })
    await nextTick()

    setFormField(wrapper, 'firstName', firstName)
    setFormField(wrapper, 'lastName', lastName)
    setFormField(wrapper, 'email', email)
    setFormField(wrapper, 'password', password)

    await wrapper.find('[data-testid="submit-btn"]').trigger('click')
    await flushPromises()
    await nextTick()

    expect(authApi.createAccountByEmail).toHaveBeenCalledTimes(1)
    const paragraph = wrapper.find('p')
    expect(paragraph.text()).toContain('Please click the link')
  })

  it('should not submit an invalid form', async () => {
    const wrapper = mount(CreateAccountDialog, {
      global: {
        plugins: [store, router, ElementPlus],
      },
    })
    await nextTick()

    setFormField(wrapper, 'firstName', 'foo')
    setFormField(wrapper, 'lastName', 'bar')
    setFormField(wrapper, 'email', 'test@email.com')
    setFormField(wrapper, 'password', '') // Intentionally left empty
    await wrapper.find('[data-testid="submit-btn"]').trigger('click')
    await nextTick()

    expect(authApi.createAccountByEmail).not.toHaveBeenCalled()
  })
})
