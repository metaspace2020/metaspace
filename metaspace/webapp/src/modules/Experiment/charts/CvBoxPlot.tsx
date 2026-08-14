import { defineComponent, PropType, computed } from 'vue'
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BoxplotChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import type { QcSampleRow } from './types'

use([CanvasRenderer, BoxplotChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])

/** Format tooltip numbers: integers stay whole, decimals snap to 2 places. */
const fmt2 = (v: unknown): string => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '')
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

function fiveNumberSummary(values: number[]): [number, number, number, number, number] {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return [0, 0, 0, 0, 0]
  const q = (p: number): number => sorted[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))]
  return [sorted[0], q(0.25), q(0.5), q(0.75), sorted[n - 1]]
}

export default defineComponent({
  name: 'CvBoxPlot',
  props: {
    samples: { type: Array as PropType<QcSampleRow[]>, required: true },
  },
  setup(props) {
    const option = computed(() => {
      const conditions = Array.from(new Set(props.samples.map((s) => s.condition ?? '—')))
      const data = conditions.map((cond) =>
        fiveNumberSummary(props.samples.filter((s) => (s.condition ?? '—') === cond).map((s) => s.cv))
      )
      return {
        title: { text: 'Within-group coefficient of variation', textStyle: { fontSize: 13 } },
        tooltip: {
          trigger: 'item',
          // Boxplot item value is [categoryIndex, min, Q1, median, Q3, max].
          formatter: (p: any) => {
            const v = Array.isArray(p?.value) ? p.value : []
            const [, min, q1, med, q3, max] = v
            return [
              p?.name ?? '',
              `max: ${fmt2(max)}`,
              `Q3: ${fmt2(q3)}`,
              `median: ${fmt2(med)}`,
              `Q1: ${fmt2(q1)}`,
              `min: ${fmt2(min)}`,
            ].join('<br/>')
          },
        },
        grid: { left: 40, right: 16, top: 48, bottom: 32 },
        xAxis: { type: 'category', data: conditions },
        yAxis: { type: 'value', name: 'CV' },
        series: [
          {
            name: 'CV',
            type: 'boxplot',
            data,
          },
        ],
      }
    })

    return () =>
      props.samples.length === 0 ? (
        <div class="text-sm text-gray-400 p-4" data-test-key="cv-empty">
          No QC samples available.
        </div>
      ) : (
        <ECharts option={option.value} autoresize style="width: 100%; height: 240px" />
      )
  },
})
