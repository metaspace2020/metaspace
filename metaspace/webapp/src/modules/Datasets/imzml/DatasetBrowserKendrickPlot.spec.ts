import { mount } from '@vue/test-utils'
import Vue from 'vue'
import { DatasetBrowserKendrickPlot } from './DatasetBrowserKendrickPlot'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import store from '../../../store'
import router from '../../../router'

jest.mock('vue-echarts', () => ({ default: jest.fn() }))
jest.mock('echarts', () => ({ default: jest.fn() }))
jest.mock('echarts/core', () => ({ default: jest.fn(), use: jest.fn() }))
jest.mock('echarts/renderers', () => ({ default: jest.fn() }))
jest.mock('echarts/charts', () => ({ default: jest.fn() }))
jest.mock('echarts/components', () => ({ default: jest.fn() }))

describe('DatasetBrowserKendrickPlot', () => {
  const testHarness = Vue.extend({
    components: {
      DatasetBrowserKendrickPlot,
    },
    render(h) {
      return h(DatasetBrowserKendrickPlot, { props: this.$attrs })
    },
  })

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
  })

  it('it should match snapshot when empty', async() => {
    const wrapper = mount(testHarness, {
      store,
      router,
      propsData: {
        isEmpty: true,
        isLoading: false,
      },
    })
    await Vue.nextTick()

    expect(wrapper.element).toMatchSnapshot()
  })
})
