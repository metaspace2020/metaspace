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
}))

import FilterChainWaterfall from './FilterChainWaterfall'
import type { FilterChainStep } from './types'

const steps: FilterChainStep[] = [
  { name: 'all', count: 1000, droppedFromPrev: null },
  { name: 'fdr<=0.1', count: 600, droppedFromPrev: 400 },
  { name: 'minDR>=0.5', count: 420, droppedFromPrev: 180 },
]

describe('FilterChainWaterfall', () => {
  it('renders one row per filter step in the input order', () => {
    const w = mount(FilterChainWaterfall, { props: { steps } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    expect(option.yAxis.data).toEqual(['all', 'fdr<=0.1', 'minDR>=0.5'])
    expect(option.series[0].data).toEqual([1000, 600, 420])
  })

  it('renders empty-state when steps array is empty', () => {
    const w = mount(FilterChainWaterfall, { props: { steps: [] } })
    expect(w.find('[data-test-key="filter-chain-empty"]').exists()).toBe(true)
  })
})
