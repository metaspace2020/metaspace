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

const flatData = (option: any) => option.series.flatMap((s: any) => s.data)

describe('VolcanoPlot', () => {
  it('renders one point per non-null pValue row and shows the null caption', () => {
    const w = mount(VolcanoPlot, { props: { rows } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const option: any = echart.props('option')
    const total = option.series.reduce((acc: number, s: any) => acc + s.data.length, 0)
    expect(total).toBe(2)
    expect(w.find('[data-test-key="volcano-null-caption"]').text()).toContain('1')
  })

  it('emits select with the full clicked row (not just the ion id)', () => {
    const w = mount(VolcanoPlot, { props: { rows } })
    const echart = w.findComponent({ name: 'echarts' }) as any
    // Each dot carries its source row so the caller can select the exact
    // group's row rather than the first row sharing the ion.
    echart.vm.$emit('click', { data: { row: rows[0], ionId: 1, value: [1.2, 3] } })
    expect(w.emitted('select')?.[0]).toEqual([rows[0]])
  })

  it('emphasises only the dot matching selectedKey when an ion spans multiple groups', () => {
    // Same ion id, two label groups → two distinct dots. Only the one whose
    // composite key matches selectedKey should be enlarged.
    const groupedRows: ResultRow[] = [
      {
        ion: { id: 9, ion: 'X+H' },
        labelGroupName: 'Circle',
        condA: 'a',
        condB: 'b',
        lfc: 1.0,
        pValue: 0.01,
        fdr: 0.02,
      },
      {
        ion: { id: 9, ion: 'X+H' },
        labelGroupName: 'Diamond',
        condA: 'a',
        condB: 'b',
        lfc: 1.5,
        pValue: 0.02,
        fdr: 0.03,
      },
    ]
    const w = mount(VolcanoPlot, {
      props: { rows: groupedRows, selectedKey: '9|Diamond|a|b' },
    })
    const echart = w.findComponent({ name: 'echarts' }) as any
    const dots = flatData(echart.props('option'))
    const circle = dots.find((d: any) => d.row.labelGroupName === 'Circle')
    const diamond = dots.find((d: any) => d.row.labelGroupName === 'Diamond')
    expect(diamond.symbolSize).toBe(14)
    expect(circle.symbolSize).toBe(8)
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
