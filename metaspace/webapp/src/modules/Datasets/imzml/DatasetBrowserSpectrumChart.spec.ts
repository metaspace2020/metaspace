import { mount } from '@vue/test-utils'
import Vue from 'vue'
import { DatasetBrowserSpectrumChart } from './DatasetBrowserSpectrumChart'
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

const testHarness = Vue.extend({
  components: {
    DatasetBrowserSpectrumChart,
  },
  render(h) {
    return h(DatasetBrowserSpectrumChart, { props: this.$attrs })
  },
})

describe('DatasetBrowserSpectrumChart', () => {
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

  it('it should match snapshot when loading chart data', async() => {
    const wrapper = mount(testHarness, {
      store,
      router,
      propsData: {
        isEmpty: false,
        isLoading: false,
        isDataLoading: true,
      },
    })
    await Vue.nextTick()

    expect(wrapper.element).toMatchSnapshot()
  })
})
