import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'

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
}))

import PcaScatter from './PcaScatter'
import type { QcSampleRow } from './types'

const samples: QcSampleRow[] = [
  { sampleId: 'ds_001', condition: 'treated', tic: 0, detectionRate: 0, cv: 0, pcaPC1: 1.2, pcaPC2: 0.5 },
  { sampleId: 'ds_005', condition: 'control', tic: 0, detectionRate: 0, cv: 0, pcaPC1: -0.8, pcaPC2: 0.3 },
  { sampleId: 'ds_006', condition: 'control', tic: 0, detectionRate: 0, cv: 0, pcaPC1: -0.4, pcaPC2: -0.1 },
]

describe('PcaScatter', () => {
  it('renders one point per sample partitioned by condition with PC variance % in axis names', () => {
    const w = mount(PcaScatter, { props: { samples, pcaVariance: { pc1: 0.38, pc2: 0.21 } } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    const allPoints = option.series.flatMap((s: any) => s.data)
    expect(allPoints).toHaveLength(3)
    const seriesNames = option.series.map((s: any) => s.name).sort()
    expect(seriesNames).toEqual(['control', 'treated'])
    expect(option.xAxis.name).toContain('38%')
    expect(option.yAxis.name).toContain('21%')
  })

  it('emits exclude when an echart click event fires with a data point', async () => {
    const w = mount(PcaScatter, { props: { samples, pcaVariance: { pc1: 0, pc2: 0 } } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    echart.vm.$emit('click', { data: { sampleId: 'ds_001', value: [1.2, 0.5] } })
    expect(w.emitted('exclude')?.[0]).toEqual(['ds_001'])
  })

  it('shows the dataset-name label in the tooltip while still keying exclude by sampleId', () => {
    const w = mount(PcaScatter, {
      props: { samples, pcaVariance: { pc1: 0, pc2: 0 }, sampleLabels: { ds_001: 'Liver A' } },
    })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    const point = option.series.flatMap((s: any) => s.data).find((d: any) => d.sampleId === 'ds_001')
    // Data carries both: label for display, sampleId for the exclude action.
    expect(point.label).toBe('Liver A')
    expect(point.sampleId).toBe('ds_001')
    expect(option.tooltip.formatter({ data: point })).toBe('Liver A (treated)')
  })

  it('renders empty-state when samples array is empty', () => {
    const w = mount(PcaScatter, { props: { samples: [], pcaVariance: { pc1: 0, pc2: 0 } } })
    expect(w.find('[data-test-key="pca-empty"]').exists()).toBe(true)
  })
})
