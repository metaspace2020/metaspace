import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'

vi.mock('vue-echarts', () => ({
  default: defineComponent({ name: 'echarts', props: ['option'], render: () => null }),
}))
vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/charts', () => ({ BarChart: {}, BoxplotChart: {} }))
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  TitleComponent: {},
  MarkLineComponent: {},
}))

import CvBoxPlot from './CvBoxPlot'
import type { QcSampleRow } from './types'

const samples: QcSampleRow[] = [
  { sampleId: 'ds_001', condition: 'treated', tic: 0.92, detectionRate: 0.95, cv: 0.1, pcaPC1: 0, pcaPC2: 0 },
  { sampleId: 'ds_002', condition: 'treated', tic: 0.88, detectionRate: 0.93, cv: 0.12, pcaPC1: 0, pcaPC2: 0 },
  { sampleId: 'ds_003', condition: 'treated', tic: 0.9, detectionRate: 0.94, cv: 0.11, pcaPC1: 0, pcaPC2: 0 },
  { sampleId: 'ds_005', condition: 'control', tic: 0.71, detectionRate: 0.75, cv: 0.2, pcaPC1: 0, pcaPC2: 0 },
  { sampleId: 'ds_006', condition: 'control', tic: 0.7, detectionRate: 0.74, cv: 0.22, pcaPC1: 0, pcaPC2: 0 },
]

describe('CvBoxPlot', () => {
  it('renders a boxplot series with one entry per distinct condition', () => {
    const w = mount(CvBoxPlot, { props: { samples } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    expect(option.series[0].type).toBe('boxplot')
    expect(option.xAxis.data.length).toBe(2)
    expect(option.series[0].data.length).toBe(2)
  })

  it('renders empty-state when samples array is empty', () => {
    const w = mount(CvBoxPlot, { props: { samples: [] } })
    expect(w.find('[data-test-key="cv-empty"]').exists()).toBe(true)
  })
})
