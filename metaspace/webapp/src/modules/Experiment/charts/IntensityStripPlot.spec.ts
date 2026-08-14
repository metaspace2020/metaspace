import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { useQuery } from '@vue/apollo-composable'

vi.mock('vue-echarts', () => ({
  default: defineComponent({ name: 'echarts', props: ['option'], render: () => null }),
}))
vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/charts', () => ({ ScatterChart: {} }))
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  TitleComponent: {},
  MarkLineComponent: {},
  ToolboxComponent: {},
  MarkAreaComponent: {},
}))

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  DefaultApolloClient: vi.fn(),
}))

import IntensityStripPlot from './IntensityStripPlot'

const mockRows = [
  { regionKey: 'r1', intensity: 10, condition: 'control', sampleId: 'ds_1', biologicalReplicateId: null },
  { regionKey: 'r2', intensity: 12, condition: 'control', sampleId: 'ds_2', biologicalReplicateId: null },
  { regionKey: 'r3', intensity: 30, condition: 'treated', sampleId: 'ds_3', biologicalReplicateId: null },
  { regionKey: 'r4', intensity: 25, condition: 'control', sampleId: 'other_1', biologicalReplicateId: null },
  { regionKey: 'r5', intensity: 40, condition: 'treated', sampleId: 'other_2', biologicalReplicateId: null },
]

const sampleIdToLabelGroup: Record<string, string> = {
  ds_1: 'Main',
  ds_2: 'Main',
  ds_3: 'Main',
  other_1: 'Secondary',
  other_2: 'Secondary',
}

describe('IntensityStripPlot', () => {
  beforeEach(() => {
    ;(useQuery as any).mockReset()
    ;(useQuery as any).mockReturnValue({
      result: ref({ experimentIonIntensities: mockRows }),
      loading: ref(false),
      error: ref(null),
    })
  })

  it('renders the placeholder when ionId is null', async () => {
    ;(useQuery as any).mockReturnValueOnce({
      result: ref(undefined),
      loading: ref(false),
      error: ref(null),
    })
    const w = mount(IntensityStripPlot, { props: { experimentId: 'e1', ionId: null, fdr: null } })
    await flushPromises()
    expect(w.find('[data-test-key="strip-empty"]').exists()).toBe(true)
  })

  it('plots one point per row across two condition series', async () => {
    const w = mount(IntensityStripPlot, { props: { experimentId: 'e1', ionId: 1, fdr: 0.5 } })
    await flushPromises()
    await nextTick()
    expect(useQuery).toHaveBeenCalled()
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    const scatterSeries = option.series.filter((s: any) => /^(control|treated)/.test(s.name))
    expect(scatterSeries).toHaveLength(2)
    const total = scatterSeries.reduce((acc: number, s: any) => acc + s.data.length, 0)
    expect(total).toBe(5)
  })

  it('filters points by labelGroupFilter using the sampleIdToLabelGroup lookup', async () => {
    const w = mount(IntensityStripPlot, {
      props: {
        experimentId: 'e1',
        ionId: 1,
        fdr: 0.5,
        sampleIdToLabelGroup,
        labelGroupFilter: 'Main',
      },
    })
    await flushPromises()
    await nextTick()
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    const scatterSeries = option.series.filter((s: any) => /^(control|treated)/.test(s.name))
    const total = scatterSeries.reduce((acc: number, s: any) => acc + s.data.length, 0)
    // Only ds_1 (control), ds_2 (control), ds_3 (treated) belong to 'Main'
    expect(total).toBe(3)
  })

  it('shows all points when labelGroupFilter is null', async () => {
    const w = mount(IntensityStripPlot, {
      props: {
        experimentId: 'e1',
        ionId: 1,
        fdr: 0.5,
        sampleIdToLabelGroup,
        labelGroupFilter: null,
      },
    })
    await flushPromises()
    await nextTick()
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    const scatterSeries = option.series.filter((s: any) => /^(control|treated)/.test(s.name))
    const total = scatterSeries.reduce((acc: number, s: any) => acc + s.data.length, 0)
    expect(total).toBe(5)
  })

  it('renders the significance bracket when fdr < 0.05 with two conditions', async () => {
    const w = mount(IntensityStripPlot, { props: { experimentId: 'e1', ionId: 1, fdr: 0.001 } })
    await flushPromises()
    await nextTick()
    expect(w.find('[data-test-key="strip-significance"]').exists()).toBe(true)
  })

  it('does not render the significance bracket when fdr >= 0.05', async () => {
    const w = mount(IntensityStripPlot, { props: { experimentId: 'e1', ionId: 1, fdr: 0.5 } })
    await flushPromises()
    await nextTick()
    expect(w.find('[data-test-key="strip-significance"]').exists()).toBe(false)
  })
})
