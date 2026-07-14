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
  ion: { id: number; ion: string; formula?: string; adduct?: string }
  lfc: number
  pValue: number | null
  fdr: number | null
}

const NEG_LOG10 = (p: number): number => -Math.log10(p)

// Mockup palette
const COLOR_UP = '#7C5CC7' // up (LFC ≥ 0) — purple
const COLOR_DOWN = '#5CA98F' // down (LFC < 0) — teal

export default defineComponent({
  name: 'VolcanoPlot',
  props: {
    rows: { type: Array as PropType<ResultRow[]>, required: true },
    fdrThreshold: { type: Number, default: 0.05 },
    selectedIonId: { type: Number as unknown as () => number | null, default: null },
  },
  emits: ['select'],
  setup(props, { emit }) {
    const plottable = computed(() => props.rows.filter((r) => r.pValue != null && r.pValue > 0))
    const nullCount = computed(() => props.rows.length - plottable.value.length)

    // Standard volcano plot convention: color by direction of log2 fold change.
    // The dashed FDR threshold line conveys significance separately, so a row
    // with high FDR still gets coloured by direction (just rendered at lower
    // opacity to de-emphasise it).
    const classify = (r: ResultRow): 'up' | 'down' => (r.lfc >= 0 ? 'up' : 'down')
    const isSignificant = (r: ResultRow): boolean => r.fdr != null && r.fdr <= props.fdrThreshold

    const seriesData = (kind: 'up' | 'down') =>
      plottable.value
        .filter((r) => classify(r) === kind)
        .map((r) => {
          const significant = isSignificant(r)
          const selected = props.selectedIonId === r.ion.id
          return {
            value: [r.lfc, NEG_LOG10(r.pValue as number)],
            ionId: r.ion.id,
            ionLabel: r.ion.ion,
            fdr: r.fdr,
            symbolSize: selected ? 14 : 8,
            itemStyle: {
              opacity: significant ? 0.95 : 0.55,
              ...(selected ? { borderColor: '#222', borderWidth: 2 } : {}),
            },
          }
        })

    const option = computed(() => {
      const upData = seriesData('up')
      const downData = seriesData('down')

      const series: any[] = [
        {
          name: `up · ${upData.length}`,
          type: 'scatter',
          symbolSize: (_: any, p: any) => p.data.symbolSize,
          itemStyle: { color: COLOR_UP },
          data: upData,
          z: 3,
        },
        {
          name: `down · ${downData.length}`,
          type: 'scatter',
          symbolSize: (_: any, p: any) => p.data.symbolSize,
          itemStyle: { color: COLOR_DOWN },
          data: downData,
          z: 3,
        },
      ]

      return {
        tooltip: {
          trigger: 'item',
          formatter: (p: any) =>
            `${p.data.ionLabel}<br/>log₂FC: ${p.data.value[0].toFixed(2)}<br/>−log10(p): ${p.data.value[1].toFixed(2)}`,
        },
        legend: {
          top: 4,
          left: 8,
          textStyle: { fontSize: 11, color: '#606266' },
          itemWidth: 10,
          itemHeight: 10,
        },
        grid: { left: 56, right: 24, top: 48, bottom: 48 },
        xAxis: {
          type: 'value',
          name: 'log₂ FOLD CHANGE',
          nameLocation: 'middle',
          nameGap: 28,
          nameTextStyle: { color: '#909399', fontSize: 10 },
          axisLine: { lineStyle: { color: '#dcdfe6' } },
          axisLabel: { color: '#606266', fontSize: 10 },
          splitLine: { lineStyle: { type: 'dashed', color: '#ebeef5' } },
        },
        yAxis: {
          type: 'value',
          name: '−log₁₀ p-VALUE',
          nameLocation: 'end',
          nameGap: 16,
          nameTextStyle: { color: '#909399', fontSize: 10, align: 'left' },
          axisLine: { show: false },
          axisLabel: { color: '#606266', fontSize: 10 },
          splitLine: { lineStyle: { type: 'dashed', color: '#ebeef5' } },
        },
        series,
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
          <ECharts option={option.value} autoresize style="width: 100%; height: 340px" onClick={onClick} />
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
