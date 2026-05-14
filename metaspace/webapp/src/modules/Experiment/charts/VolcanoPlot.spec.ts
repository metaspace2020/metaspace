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

  it('omits markLine when no row passes the FDR threshold', () => {
    const noPass: ResultRow[] = [{ ion: { id: 9, ion: 'X' }, lfc: 0.1, pValue: 0.5, fdr: 0.9 }]
    const w = mount(VolcanoPlot, { props: { rows: noPass } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    expect(option.series[0].markLine).toBeUndefined()
  })

  it('includes markLine when a row passes the FDR threshold', () => {
    const w = mount(VolcanoPlot, { props: { rows } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    expect(option.series[0].markLine).toBeDefined()
    expect(option.series[0].markLine.data[0].yAxis).toBeCloseTo(-Math.log10(0.001))
  })

  it('renders empty-state when rows array is empty', () => {
    const w = mount(VolcanoPlot, { props: { rows: [] } })
    expect(w.find('[data-test-key="volcano-empty"]').exists()).toBe(true)
  })
})
