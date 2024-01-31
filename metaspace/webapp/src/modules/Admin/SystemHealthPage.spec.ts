import { mount } from '@vue/test-utils'
import SystemHealthPage from './SystemHealthPage.vue'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import store from '../../store'
import router from '../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'

describe('SystemHealthPage', () => {
  const adminQuery = () => {
    initMockGraphqlClient({
      Query: () => ({
        currentUser: () => ({ id: 'userid', role: 'admin' }),
      }),
      Mutation: () => ({
        updateSystemHealth: () => true,
      }),
    })
  }
  const updateErrorQuery = () => {
    initMockGraphqlClient({
      Query: () => ({
        currentUser: () => ({ id: 'userid', role: 'admin' }),
      }),
      Mutation: () => ({
        updateSystemHealth: () => new Error('internal error'),
      }),
    })
  }

  const userQuery = () => {
    initMockGraphqlClient({
      Query: () => ({
        currentUser: () => ({ id: 'userid', role: 'user' }),
      }),
    })
  }

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
  })

  it('should match snapshot logged as non-admin', async() => {
    userQuery()
    const wrapper = mount(SystemHealthPage, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should match snapshot logged as admin', async() => {
    adminQuery()
    const wrapper = mount(SystemHealthPage, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should be able to toggle all system health options as admin', async() => {
    adminQuery()
    const wrapper = mount(SystemHealthPage, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper.findAll('.el-radio').length).toBe(3)
    expect(wrapper.findAll('.el-radio').at(0).text()).toBe('Enable everything')
    expect(wrapper.findAll('.el-radio').at(0).classes()).toContain('is-checked')

    expect(wrapper.findAll('.el-radio').at(1).text()).toBe('Disable dataset upload/reprocessing')
    expect(wrapper.findAll('.el-radio').at(1).classes()).not.toContain('is-checked')
    wrapper.findAll('.el-radio').at(1).trigger('click')
    await Vue.nextTick()
    expect(wrapper.findAll('.el-radio').at(1).classes()).toContain('is-checked')

    expect(wrapper.findAll('.el-radio').at(2).text()).toBe('Read-only mode')
    expect(wrapper.findAll('.el-radio').at(2).classes()).not.toContain('is-checked')
    wrapper.findAll('.el-radio').at(2).trigger('click')
    await Vue.nextTick()
    expect(wrapper.findAll('.el-radio').at(2).classes()).toContain('is-checked')

    expect(wrapper.find('.el-button').text()).toBe('Update')
  })

  it('should toggle Enable everything option and update', async() => {
    adminQuery()
    const wrapper = mount(SystemHealthPage, { store, router, apolloProvider })
    await Vue.nextTick()

    wrapper.findAll('.el-radio').at(0).trigger('click')
    expect(wrapper.findAll('.el-radio').at(0).classes()).toContain('is-checked')
    await Vue.nextTick()

    expect(wrapper.find('.el-button').text()).toBe('Update')
    wrapper.find('.el-button').trigger('click')
    await Vue.nextTick()
    expect(wrapper.find('.el-button').text()).toBe('Updated')
  })

  it('should toggle Disable dataset upload/reprocessing option and update', async() => {
    adminQuery()
    const wrapper = mount(SystemHealthPage, { store, router, apolloProvider })
    await Vue.nextTick()

    wrapper.findAll('.el-radio').at(1).trigger('click')
    await Vue.nextTick()
    expect(wrapper.findAll('.el-radio').at(1).classes()).toContain('is-checked')

    expect(wrapper.find('.el-button').text()).toBe('Update')
    wrapper.find('.el-button').trigger('click')
    await Vue.nextTick()
    expect(wrapper.find('.el-button').text()).toBe('Updated')
  })

  it('should toggle Read-only mode option and update', async() => {
    adminQuery()
    const wrapper = mount(SystemHealthPage, { store, router, apolloProvider })
    await Vue.nextTick()

    wrapper.findAll('.el-radio').at(2).trigger('click')
    await Vue.nextTick()
    expect(wrapper.findAll('.el-radio').at(2).classes()).toContain('is-checked')

    expect(wrapper.find('.el-button').text()).toBe('Update')
    wrapper.find('.el-button').trigger('click')
    await Vue.nextTick()
    expect(wrapper.find('.el-button').text()).toBe('Updated')
  })

  it('should display update error', async() => {
    updateErrorQuery()
    const wrapper = mount(SystemHealthPage, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper.find('.el-button').text()).toBe('Update')
    wrapper.find('.el-button').trigger('click')
    await Vue.nextTick()
    expect(wrapper.find('.el-button').text()).toBe('Error')
  })
})
