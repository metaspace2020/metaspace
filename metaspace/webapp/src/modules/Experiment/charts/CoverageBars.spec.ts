import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'

vi.mock('vue-echarts', () => ({
  default: defineComponent({ name: 'echarts', props: ['option'], render: () => null }),
}))
vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/charts', () => ({ BarChart: {} }))
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  TitleComponent: {},
  MarkLineComponent: {},
}))

import CoverageBars, { CoverageRow } from './CoverageBars'

const rows: CoverageRow[] = [
  { regionKey: 'uuid-0', sampleId: 'ds_001', detected: 80, total: 100 },
  { regionKey: 'uuid-1', sampleId: 'ds_002', detected: 60, total: 100 },
  { regionKey: 'uuid-2', sampleId: 'ds_003', detected: 50, total: 200 },
]

describe('CoverageBars', () => {
  it('renders one y-axis category per sampleId (not regionKey UUIDs) with detected/total ratios', () => {
    const w = mount(CoverageBars, { props: { rows } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    expect(option.yAxis.data).toEqual(['ds_001', 'ds_002', 'ds_003'])
    expect(option.series[0].data).toEqual([0.8, 0.6, 0.25])
  })

  it('disambiguates duplicate sampleIds with (R<index>) suffix', () => {
    const dup: CoverageRow[] = [
      { regionKey: 'a', sampleId: 'ds_001', detected: 80, total: 100 },
      { regionKey: 'b', sampleId: 'ds_001', detected: 50, total: 100 },
    ]
    const w = mount(CoverageBars, { props: { rows: dup } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    expect(option.yAxis.data).toEqual(['ds_001 (R1)', 'ds_001 (R2)'])
  })

  it('places a markLine at x=0.75', () => {
    const w = mount(CoverageBars, { props: { rows } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    expect(option.series[0].markLine.data).toEqual([{ xAxis: 0.75 }])
  })

  it('renders empty-state when rows is empty', () => {
    const w = mount(CoverageBars, { props: { rows: [] } })
    expect(w.find('[data-test-key="coverage-empty"]').exists()).toBe(true)
  })
})
