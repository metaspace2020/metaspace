import { ref, nextTick, defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { initMockGraphqlClient } from '../../../tests/utils/mockGraphqlClient'

vi.mock('vue-echarts', () => ({
  default: defineComponent({ name: 'echarts', props: ['option'], render: () => null }),
}))
vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/charts', () => ({
  BarChart: {},
  BoxplotChart: {},
  ScatterChart: {},
}))
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  TitleComponent: {},
  MarkLineComponent: {},
  DataZoomComponent: {},
}))

import SampleQcStage from './SampleQcStage'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  DefaultApolloClient: vi.fn(),
}))

describe('SampleQcStage', () => {
  let mockClient: any
  let mutateSpy: any

  beforeAll(async () => {
    await initMockGraphqlClient({ Query: () => ({}) })
  })

  beforeEach(() => {
    const samples = ['s0', 's1', 's2', 's3'].map((sampleId, i) => ({
      regionKey: `region-${i}`,
      sampleId,
      condition: i < 2 ? 'treated' : 'control',
      tic: 0.8 + 0.02 * i,
      detectionRate: 0.9 - 0.05 * i,
      cv: 0.1 + 0.02 * i,
      pcaPC1: 0.1 * i,
      pcaPC2: -0.1 * i,
    }))
    ;(useQuery as any).mockReturnValue({
      result: ref({
        experimentRunQc: { samples, pcaVariance: { pc1: 0.4, pc2: 0.2 } },
      }),
      loading: ref(false),
    })
    mutateSpy = vi.fn().mockResolvedValue({ data: {} })
    mockClient = { mutate: mutateSpy, query: vi.fn().mockResolvedValue({ data: {} }) }
  })

  it('renders a checkbox per distinct sampleId and toggling calls the mutation', async () => {
    const wrapper = mount(SampleQcStage, {
      props: { experimentId: 'e1', initialExcluded: [] },
      global: { provide: { [DefaultApolloClient]: mockClient } },
    })
    await flushPromises()
    await nextTick()

    for (const id of ['s0', 's1', 's2', 's3']) {
      expect(wrapper.find(`[data-test-key="sample-${id}"]`).exists()).toBe(true)
    }

    const cb = wrapper.findComponent('[data-test-key="sample-s1"]') as any
    cb.vm.$emit('change', false)
    await flushPromises()

    expect(mutateSpy).toHaveBeenCalledTimes(1)
    const call = mutateSpy.mock.calls[0][0].variables
    expect(call.experimentId).toBe('e1')
    expect(call.excludedSamples).toEqual(['s1'])
  })

  it('renders the QC chart grid alongside the checkbox grid', async () => {
    const wrapper = mount(SampleQcStage, {
      props: { experimentId: 'e1', initialExcluded: [] },
      global: { provide: { [DefaultApolloClient]: mockClient } },
    })
    await flushPromises()
    await nextTick()
    expect(wrapper.find('[data-test-key="qc-charts"]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'PcaScatter' }).exists()).toBe(true)
  })

  it('excluding a sample via the PCA scatter triggers the mutation', async () => {
    const wrapper = mount(SampleQcStage, {
      props: { experimentId: 'e1', initialExcluded: [] },
      global: { provide: { [DefaultApolloClient]: mockClient } },
    })
    await flushPromises()
    await nextTick()
    const pca = wrapper.findComponent({ name: 'PcaScatter' }) as any
    pca.vm.$emit('exclude', 's2')
    await flushPromises()
    expect(mutateSpy).toHaveBeenCalled()
    const call = mutateSpy.mock.calls.at(-1)![0].variables
    expect(call.excludedSamples).toContain('s2')
  })
})
