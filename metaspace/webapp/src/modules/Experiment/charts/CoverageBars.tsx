import { defineComponent, PropType, computed } from 'vue'
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, TitleComponent, MarkLineComponent } from 'echarts/components'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, TitleComponent, MarkLineComponent])

export interface CoverageRow {
  regionKey: string
  sampleId: string
  detected: number
  total: number
}

/**
 * Per-sample coverage bars. Each row is a horizontal bar representing the
 * detected/total ratio for that sample, with a vertical reference line at the
 * 75% threshold so under-covered samples stand out.
 */
export default defineComponent({
  name: 'CoverageBars',
  props: {
    rows: { type: Array as PropType<CoverageRow[]>, required: true },
  },
  setup(props) {
    const labels = computed(() => {
      const counts = new Map<string, number>()
      for (const r of props.rows) counts.set(r.sampleId, (counts.get(r.sampleId) ?? 0) + 1)
      const seen = new Map<string, number>()
      return props.rows.map((r) => {
        if ((counts.get(r.sampleId) ?? 0) <= 1) return r.sampleId
        const idx = (seen.get(r.sampleId) ?? 0) + 1
        seen.set(r.sampleId, idx)
        return `${r.sampleId} (R${idx})`
      })
    })

    const option = computed(() => {
      const ratios = props.rows.map((r) => (r.total > 0 ? r.detected / r.total : 0))
      const labelList = labels.value
      const rows = props.rows
      return {
        title: { text: 'Per-sample coverage', textStyle: { fontSize: 13 } },
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params
            const idx = labelList.indexOf(p.name)
            const r = rows[idx]
            if (!r) return ''
            return `${p.name}: ${r.detected} / ${r.total} (${(p.value * 100).toFixed(1)}%)`
          },
        },
        grid: { left: 120, right: 32, top: 40, bottom: 32 },
        xAxis: { type: 'value', min: 0, max: 1, name: 'Detected / total' },
        yAxis: { type: 'category', data: labelList },
        series: [
          {
            type: 'bar',
            data: ratios,
            itemStyle: { color: '#10b981' },
            markLine: {
              symbol: 'none',
              silent: true,
              lineStyle: { type: 'dashed', color: '#9ca3af' },
              data: [{ xAxis: 0.75 }],
            },
          },
        ],
      }
    })

    return () =>
      props.rows.length === 0 ? (
        <div class="text-sm text-gray-400 p-4" data-test-key="coverage-empty">
          No coverage data available.
        </div>
      ) : (
        <ECharts option={option.value} autoresize style="width: 100%; height: 240px" />
      )
  },
})
