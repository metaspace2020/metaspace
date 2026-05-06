import { defineComponent, PropType, computed } from 'vue'
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, MarkLineComponent } from 'echarts/components'

use([CanvasRenderer, ScatterChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, MarkLineComponent])

/**
 * One row in the experiment results table.
 */
export interface ResultRow {
  ion: { id: number; ion: string }
  lfc: number
  pValue: number | null
  fdr: number | null
}

const NEG_LOG10 = (p: number): number => -Math.log10(p)

export default defineComponent({
  name: 'VolcanoPlot',
  props: {
    rows: { type: Array as PropType<ResultRow[]>, required: true },
    fdrThreshold: { type: Number, default: 0.05 },
  },
  emits: ['select'],
  setup(props, { emit }) {
    const plottable = computed(() => props.rows.filter((r) => r.pValue != null && r.pValue > 0))
    const nullCount = computed(() => props.rows.length - plottable.value.length)

    const thresholdY = computed<number | null>(() => {
      const passing = props.rows.filter(
        (r) => r.fdr != null && r.fdr <= props.fdrThreshold && r.pValue != null && r.pValue > 0
      )
      if (passing.length === 0) return null
      const minP = Math.min(...passing.map((r) => r.pValue as number))
      return NEG_LOG10(minP)
    })

    const option = computed(() => {
      const data = plottable.value.map((r) => ({
        value: [r.lfc, NEG_LOG10(r.pValue as number)],
        ionId: r.ion.id,
        ionLabel: r.ion.ion,
        fdr: r.fdr,
      }))
      const series: Record<string, unknown> = {
        name: 'ions',
        type: 'scatter',
        symbolSize: 8,
        data,
      }
      if (thresholdY.value != null) {
        series.markLine = {
          symbol: 'none',
          lineStyle: { type: 'dashed', color: '#888' },
          data: [{ yAxis: thresholdY.value, name: `FDR ≤ ${props.fdrThreshold}` }],
        }
      }
      return {
        title: { text: 'Volcano plot', textStyle: { fontSize: 13 } },
        tooltip: {
          trigger: 'item',
          formatter: (p: any) =>
            `${p.data.ionLabel}<br/>LFC: ${p.data.value[0].toFixed(2)}<br/>−log10(p): ${p.data.value[1].toFixed(2)}`,
        },
        grid: { left: 48, right: 16, top: 48, bottom: 40 },
        xAxis: { type: 'value', name: 'log fold change', nameLocation: 'middle', nameGap: 24 },
        yAxis: { type: 'value', name: '−log10(p-Value)', nameLocation: 'middle', nameGap: 36 },
        series: [series],
      }
    })

    const onClick = (evt: any): void => {
      const id = evt?.data?.ionId
      if (typeof id === 'number') emit('select', id)
    }

    return () => {
      if (props.rows.length === 0) {
        return (
          <div class="text-sm text-gray-400 p-4" data-test-key="volcano-empty">
            No results to plot.
          </div>
        )
      }
      return (
        <div data-test-key="volcano-plot">
          <ECharts option={option.value} autoresize style="width: 100%; height: 320px" onClick={onClick} />
          {nullCount.value > 0 && (
            <div class="text-xs text-gray-500 px-2" data-test-key="volcano-null-caption">
              ({nullCount.value} null pValues hidden)
            </div>
          )}
        </div>
      )
    }
  },
})
