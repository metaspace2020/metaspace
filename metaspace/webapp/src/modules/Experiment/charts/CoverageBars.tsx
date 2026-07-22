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
  /** Display label override (e.g. dataset name). Falls back to sampleId. */
  label?: string
  /** Sample condition; used to color the bar (treated=purple, control=teal). */
  condition?: string | null
  detected: number
  total: number
}

const FALLBACK_COLOR = '#10b981'
const UNKNOWN_CONDITION = '(no condition)'

/**
 * Per-sample coverage bars. Each row is a horizontal bar representing the
 * detected/total ratio for that sample. When `groupByCondition` is true the
 * rows are sorted by condition (each condition's samples grouped together),
 * with colors taken from `conditionColors`. A vertical reference line at the
 * 75% threshold marks under-covered samples.
 */
export default defineComponent({
  name: 'CoverageBars',
  props: {
    rows: { type: Array as PropType<CoverageRow[]>, required: true },
    groupByCondition: { type: Boolean, default: false },
    /** Condition name → bar color. Missing entries fall back to FALLBACK_COLOR. */
    conditionColors: { type: Object as PropType<Record<string, string>>, default: () => ({}) },
  },
  setup(props) {
    const conditionOf = (r: CoverageRow): string => r.condition || UNKNOWN_CONDITION

    /** Stable condition order matching `conditionColors` insertion order so
     *  the chart row grouping matches the legend the parent renders. */
    const orderedRows = computed<CoverageRow[]>(() => {
      if (!props.groupByCondition) return props.rows
      const order = Object.keys(props.conditionColors)
      const bucket: Record<string, CoverageRow[]> = {}
      for (const r of props.rows) {
        const c = conditionOf(r)
        ;(bucket[c] ??= []).push(r)
      }
      const out: CoverageRow[] = []
      for (const c of order) if (bucket[c]) out.push(...bucket[c])
      for (const c of Object.keys(bucket)) if (!order.includes(c)) out.push(...bucket[c])
      return out
    })

    const labels = computed(() => {
      const counts = new Map<string, number>()
      for (const r of orderedRows.value) {
        const k = r.label ?? r.sampleId
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      const seen = new Map<string, number>()
      return orderedRows.value.map((r) => {
        const base = r.label ?? r.sampleId
        if ((counts.get(base) ?? 0) <= 1) return base
        const idx = (seen.get(base) ?? 0) + 1
        seen.set(base, idx)
        return `${base} (R${idx})`
      })
    })

    const option = computed(() => {
      const rows = orderedRows.value
      const ratios = rows.map((r) => (r.total > 0 ? r.detected / r.total : 0))
      const labelList = labels.value
      const colored = ratios.map((value, i) => ({
        value,
        itemStyle: {
          color: props.groupByCondition
            ? props.conditionColors[conditionOf(rows[i])] ?? FALLBACK_COLOR
            : FALLBACK_COLOR,
        },
      }))
      return {
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params
            const idx = labelList.indexOf(p.name)
            const r = rows[idx]
            if (!r) return ''
            const cond = r.condition ? ` · ${r.condition}` : ''
            return `${p.name}${cond}: ${r.detected} / ${r.total} (${(p.value * 100).toFixed(1)}%)`
          },
        },
        grid: { left: 180, right: 32, top: 16, bottom: 32 },
        xAxis: { type: 'value', min: 0, max: 1, name: 'Detected / total' },
        yAxis: {
          type: 'category',
          data: labelList,
          inverse: true,
          axisLabel: {
            fontSize: 12,
            width: 160,
            overflow: 'truncate',
            ellipsis: '…',
          },
          axisTick: { alignWithLabel: true },
        },
        series: [
          {
            type: 'bar',
            data: colored,
            barCategoryGap: '35%',
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

    const height = computed(() => Math.max(180, props.rows.length * 36 + 60))

    return () =>
      props.rows.length === 0 ? (
        <div class="text-sm text-gray-400 p-4" data-test-key="coverage-empty">
          No coverage data available.
        </div>
      ) : (
        <ECharts option={option.value} autoresize style={`width: 100%; height: ${height.value}px`} />
      )
  },
})
