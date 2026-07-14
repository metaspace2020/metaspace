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
  MarkLineComponent: {},
}))

import VolcanoPlot, { ResultRow } from './VolcanoPlot'

const rows: ResultRow[] = [
  { ion: { id: 1, ion: 'A+H' }, lfc: 1.2, pValue: 0.001, fdr: 0.01 },
  { ion: { id: 2, ion: 'B+H' }, lfc: -0.6, pValue: 0.04, fdr: 0.12 },
  { ion: { id: 3, ion: 'C+Na' }, lfc: 0.2, pValue: null, fdr: null },
]

describe('VolcanoPlot', () => {
  it('renders one point per non-null pValue row and shows the null caption', () => {
    const w = mount(VolcanoPlot, { props: { rows } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    const total = option.series.reduce((acc: number, s: any) => acc + s.data.length, 0)
    expect(total).toBe(2)
    expect(w.find('[data-test-key="volcano-null-caption"]').text()).toContain('1')
  })

  it('emits select with the ion id on click', () => {
    const w = mount(VolcanoPlot, { props: { rows } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    echart.vm.$emit('click', { data: { ionId: 1, ionLabel: 'A+H', value: [1.2, 3] } })
    expect(w.emitted('select')?.[0]).toEqual([1])
  })

  it('never renders the FDR threshold markLine (removed per design)', () => {
    // The orange "FDR 0.05" dashed line was removed from the volcano plot.
    const w = mount(VolcanoPlot, { props: { rows } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    for (const s of option.series) {
      expect(s.markLine).toBeUndefined()
    }
  })

  it('renders empty-state when rows array is empty', () => {
    const w = mount(VolcanoPlot, { props: { rows: [] } })
    expect(w.find('[data-test-key="volcano-empty"]').exists()).toBe(true)
  })
})
