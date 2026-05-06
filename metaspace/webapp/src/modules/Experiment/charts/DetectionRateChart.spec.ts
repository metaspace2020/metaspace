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

import DetectionRateChart from './DetectionRateChart'
import type { QcSampleRow } from './types'

const samples: QcSampleRow[] = [
  {
    regionKey: 'r1',
    sampleId: 'ds_001',
    condition: 'treated',
    tic: 0.92,
    detectionRate: 0.95,
    cv: 0.1,
    pcaPC1: 0,
    pcaPC2: 0,
  },
  {
    regionKey: 'r2',
    sampleId: 'ds_002',
    condition: 'treated',
    tic: 0.88,
    detectionRate: 0.93,
    cv: 0.12,
    pcaPC1: 0,
    pcaPC2: 0,
  },
  {
    regionKey: 'r3',
    sampleId: 'ds_005',
    condition: 'control',
    tic: 0.71,
    detectionRate: 0.75,
    cv: 0.2,
    pcaPC1: 0,
    pcaPC2: 0,
  },
]

describe('DetectionRateChart', () => {
  it('renders bars grouped by condition with sampleIds on the x-axis and a 0.75 markLine', () => {
    const w = mount(DetectionRateChart, { props: { samples } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    expect(option.xAxis.data).toEqual(['ds_001', 'ds_002', 'ds_005'])
    const seriesNames = option.series.map((s: any) => s.name).sort()
    expect(seriesNames).toEqual(['control', 'treated'])
    expect(option.series[0].markLine.data[0].yAxis).toBe(0.75)
  })

  it('disambiguates duplicate sampleIds with (R<index>) suffix', () => {
    const dup: QcSampleRow[] = [
      {
        regionKey: 'a',
        sampleId: 'ds_001',
        condition: 'treated',
        tic: 1,
        detectionRate: 0.9,
        cv: 0,
        pcaPC1: 0,
        pcaPC2: 0,
      },
      {
        regionKey: 'b',
        sampleId: 'ds_001',
        condition: 'treated',
        tic: 2,
        detectionRate: 0.8,
        cv: 0,
        pcaPC1: 0,
        pcaPC2: 0,
      },
    ]
    const w = mount(DetectionRateChart, { props: { samples: dup } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    expect(option.xAxis.data).toEqual(['ds_001 (R1)', 'ds_001 (R2)'])
  })

  it('renders empty-state when samples array is empty', () => {
    const w = mount(DetectionRateChart, { props: { samples: [] } })
    expect(w.find('[data-test-key="detection-empty"]').exists()).toBe(true)
  })
})
