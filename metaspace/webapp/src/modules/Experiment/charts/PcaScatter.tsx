import { defineComponent, PropType, computed } from 'vue'
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import type { QcSampleRow } from './types'

use([CanvasRenderer, ScatterChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])

interface PcaVariance {
  pc1: number
  pc2: number
}

const pct = (x: number): string => `${Math.round(x * 100)}%`

export default defineComponent({
  name: 'PcaScatter',
  props: {
    samples: { type: Array as PropType<QcSampleRow[]>, required: true },
    pcaVariance: { type: Object as PropType<PcaVariance>, required: true },
  },
  emits: ['exclude'],
  setup(props, { emit }) {
    const option = computed(() => {
      const conditions = Array.from(new Set(props.samples.map((s) => s.condition ?? '—')))
      const series = conditions.map((cond) => ({
        name: cond,
        type: 'scatter',
        symbolSize: 12,
        data: props.samples
          .filter((s) => (s.condition ?? '—') === cond)
          .map((s) => ({ value: [s.pcaPC1, s.pcaPC2], sampleId: s.sampleId, condition: cond })),
      }))
      return {
        title: { text: 'PCA — PC1 vs PC2', textStyle: { fontSize: 13 } },
        tooltip: {
          trigger: 'item',
          formatter: (p: any) => `${p.data.sampleId} (${p.data.condition})`,
        },
        legend: { top: 24 },
        grid: { left: 48, right: 16, top: 64, bottom: 40 },
        xAxis: { type: 'value', name: `PC1 (${pct(props.pcaVariance.pc1)})`, nameLocation: 'middle', nameGap: 24 },
        yAxis: { type: 'value', name: `PC2 (${pct(props.pcaVariance.pc2)})`, nameLocation: 'middle', nameGap: 32 },
        series,
      }
    })

    const onClick = (evt: any): void => {
      const id = evt?.data?.sampleId
      if (typeof id === 'string') emit('exclude', id)
    }

    return () =>
      props.samples.length === 0 ? (
        <div class="text-sm text-gray-400 p-4" data-test-key="pca-empty">
          No PCA data yet.
        </div>
      ) : (
        <ECharts option={option.value} autoresize style="width: 100%; height: 280px" onClick={onClick} />
      )
  },
})
