import { defineComponent, PropType, computed } from 'vue'
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, TitleComponent } from 'echarts/components'
import type { FilterChainStep } from './types'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, TitleComponent])

/**
 * Horizontal waterfall chart showing how many ions remain after each filter
 * step in the analysis chain. Each row's bar length is the remaining count;
 * inline labels on the right show the drop from the previous step (`-N`).
 */
export default defineComponent({
  name: 'FilterChainWaterfall',
  props: {
    steps: { type: Array as PropType<FilterChainStep[]>, required: true },
  },
  setup(props) {
    const option = computed(() => {
      const categories = props.steps.map((s) => s.name)
      const counts = props.steps.map((s) => s.count)
      const labels = props.steps.map((s) => (s.droppedFromPrev != null ? `-${s.droppedFromPrev}` : ''))
      return {
        title: { text: 'Filter chain', textStyle: { fontSize: 13 } },
        tooltip: { trigger: 'axis' },
        grid: { left: 120, right: 80, top: 40, bottom: 32 },
        xAxis: { type: 'value', name: 'Ions remaining' },
        yAxis: { type: 'category', data: categories, inverse: true },
        series: [
          {
            type: 'bar',
            data: counts,
            label: {
              show: true,
              position: 'right',
              formatter: (params: { dataIndex: number }) => labels[params.dataIndex] ?? '',
              color: '#b91c1c',
            },
            itemStyle: { color: '#3b82f6' },
          },
        ],
      }
    })

    return () =>
      props.steps.length === 0 ? (
        <div class="text-sm text-gray-400 p-4" data-test-key="filter-chain-empty">
          No filter chain data available.
        </div>
      ) : (
        <ECharts option={option.value} autoresize style="width: 100%; height: 240px" />
      )
  },
})
