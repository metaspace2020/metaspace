import { defineComponent, PropType, computed } from 'vue'
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import type { QcSampleRow } from './types'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])

/** Format tooltip numbers: integers stay whole, decimals snap to 2 places. */
const fmt2 = (v: unknown): string => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '')
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}
/** Axis-trigger tooltip that renders each series value at 2 decimals. */
const axisTooltipFormatter = (params: any): string => {
  const items = Array.isArray(params) ? params : [params]
  const header = items[0]?.axisValueLabel ?? items[0]?.name ?? ''
  const lines = items
    .filter((it: any) => it.value != null)
    .map((it: any) => `${it.marker ?? ''}${it.seriesName}: ${fmt2(it.value)}`)
  return [header, ...lines].join('<br/>')
}

export default defineComponent({
  name: 'TicBarsChart',
  props: {
    samples: { type: Array as PropType<QcSampleRow[]>, required: true },
  },
  setup(props) {
    const xLabels = computed(() => {
      const counts = new Map<string, number>()
      for (const s of props.samples) counts.set(s.sampleId, (counts.get(s.sampleId) ?? 0) + 1)
      const seen = new Map<string, number>()
      return props.samples.map((s) => {
        if ((counts.get(s.sampleId) ?? 0) <= 1) return s.sampleId
        const idx = (seen.get(s.sampleId) ?? 0) + 1
        seen.set(s.sampleId, idx)
        return `${s.sampleId} (R${idx})`
      })
    })

    const option = computed(() => {
      const conditions = Array.from(new Set(props.samples.map((s) => s.condition ?? '—')))
      const series = conditions.map((cond) => ({
        name: cond,
        type: 'bar',
        data: props.samples.map((s) => ((s.condition ?? '—') === cond ? s.tic : null)),
      }))
      return {
        title: { text: 'Total ion signal per sample', textStyle: { fontSize: 13 } },
        tooltip: { trigger: 'axis', formatter: axisTooltipFormatter },
        legend: { top: 24 },
        grid: { left: 40, right: 16, top: 64, bottom: 16 },
        xAxis: { type: 'category', data: xLabels.value, axisLabel: { show: false }, axisTick: { show: false } },
        yAxis: { type: 'value', name: 'TIC (norm.)' },
        series,
      }
    })

    return () =>
      props.samples.length === 0 ? (
        <div class="text-sm text-gray-400 p-4" data-test-key="tic-empty">
          No QC samples available.
        </div>
      ) : (
        <ECharts option={option.value} autoresize style="width: 100%; height: 240px" />
      )
  },
})
