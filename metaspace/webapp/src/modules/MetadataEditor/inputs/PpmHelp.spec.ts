import { mount } from '@vue/test-utils'
import PpmHelp from './PpmHelp.vue'
import router from '../../../router'
import store from '../../../store/index'
import Vue from 'vue'

describe('PpmHelp', () => {
  it('should match snapshot', async() => {
    const wrapper = mount(PpmHelp, { store, router })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })
})
