import { DatasetBrowserSpectrumChart } from './DatasetBrowserSpectrumChart'
import { nextTick, h, defineComponent  } from 'vue';
import { mount, flushPromises } from '@vue/test-utils'
import router from "../../../router";
import store from "../../../store";


vi.mock('vue-echarts', () => ({ default: vi.fn() }))
vi.mock('echarts', () => ({ default: vi.fn() }))
vi.mock('echarts/core', () => ({ default: vi.fn(), use: vi.fn() }))
vi.mock('echarts/renderers', async () => {
  const actual : any = await vi.importActual("echarts/renderers")
  return {
    ...actual,
  }
})
vi.mock('echarts/charts', async () => {
  const actual : any = await vi.importActual("echarts/charts")
  return {
    ...actual,
  }
})
vi.mock('echarts/components', async () => {
  const actual : any = await vi.importActual("echarts/charts")
  return {
    ...actual,
    GridComponent: vi.fn(),
    TooltipComponent: vi.fn(),
    ToolboxComponent: vi.fn(),
    LegendComponent: vi.fn(),
    DataZoomComponent: vi.fn(),
    MarkPointComponent: vi.fn(),
    TitleComponent: vi.fn(),
    VisualMapPiecewiseComponent: vi.fn(),
    VisualMapContinuousComponent: vi.fn(),
  }
})


describe('DatasetBrowserKendrickPlot', () => {
  const testHarness = defineComponent({
    components: {
      DatasetBrowserSpectrumChart,
    },
    setup(props, { attrs }) {
      return () => h(DatasetBrowserSpectrumChart, { ...attrs, ...props });
    },
  });

  it('it should match snapshot when empty', async() => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
      },
      props: {
        isEmpty: true,
        isLoading: false,
      }
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toMatchSnapshot();
  })
})
