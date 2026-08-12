import { DatasetBrowserMeanSpectrum } from './DatasetBrowserMeanSpectrum'
import { nextTick, h, defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import router from '../../../router'
import store from '../../../store'

vi.mock('vue-echarts', () => ({ default: vi.fn() }))
vi.mock('echarts', () => ({ default: vi.fn() }))
vi.mock('echarts/core', () => ({ default: vi.fn(), use: vi.fn() }))
vi.mock('echarts/renderers', async () => {
  const actual: any = await vi.importActual('echarts/renderers')
  return {
    ...actual,
  }
})
vi.mock('echarts/charts', async () => {
  const actual: any = await vi.importActual('echarts/charts')
  return {
    ...actual,
  }
})
vi.mock('echarts/components', async () => {
  const actual: any = await vi.importActual('echarts/charts')
  return {
    ...actual,
    GridComponent: vi.fn(),
    TooltipComponent: vi.fn(),
    ToolboxComponent: vi.fn(),
    DataZoomComponent: vi.fn(),
  }
})

describe('DatasetBrowserMeanSpectrum', () => {
  const testHarness = defineComponent({
    components: {
      DatasetBrowserMeanSpectrum,
    },
    setup(props, { attrs }) {
      return () => h(DatasetBrowserMeanSpectrum, { ...attrs, ...props })
    },
  })

  const mountChart = (props: any) =>
    mount(testHarness, {
      global: {
        plugins: [store, router],
      },
      props,
    })

  it('it should match snapshot when empty', async () => {
    const wrapper = mountChart({
      isEmpty: true,
      isLoading: false,
      emptyMessage: 'No saved regions for this dataset — define an ROI to see its mean spectrum',
    })

    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('it should show the empty message when there is no data', async () => {
    const message = 'No saved regions for this dataset — define an ROI to see its mean spectrum'
    const wrapper = mountChart({ isEmpty: true, isLoading: false, emptyMessage: message })

    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain(message)
  })

  it('it should render the chart once data is present', async () => {
    const wrapper = mountChart({
      isEmpty: false,
      isLoading: false,
      stat: 'MEAN',
      data: [
        [200.1234, 1e5, 120],
        [300.5678, 5e4, 80],
      ],
    })

    await flushPromises()
    await nextTick()

    expect(wrapper.find('.chart-holder').exists()).toBe(true)
    expect(wrapper.find('.dataset-browser-mean-spectrum-empty').exists()).toBe(false)
  })
})
