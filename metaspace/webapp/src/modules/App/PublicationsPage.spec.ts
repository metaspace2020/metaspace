import { mount } from '@vue/test-utils'
import PublicationsPage from './PublicationsPage.vue'
import router from '../../router'
import store from '../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'

Vue.use(Vuex)
sync(store, router)

describe('PublicationsPage', () => {
  it('should match snapshot', async() => {
    const wrapper = mount(PublicationsPage, { store, router })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })
})
