import { mount } from '@vue/test-utils'
import MetaspaceFooter from './MetaspaceFooter.vue'
import router from '../../router'
import store from '../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'

Vue.use(Vuex)
sync(store, router)

describe('MetaspaceFooter', () => {
  it('should match snapshot', async() => {
    const wrapper = mount(MetaspaceFooter, { store, router })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })
})
