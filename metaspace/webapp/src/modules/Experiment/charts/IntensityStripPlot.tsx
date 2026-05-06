import { defineComponent, computed } from 'vue'
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  MarkAreaComponent,
} from 'echarts/components'
import { useQuery } from '@vue/apollo-composable'
import { experimentIonIntensitiesQuery } from '../api'

use([
  CanvasRenderer,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  MarkAreaComponent,
])

interface IntensityRow {
  regionKey: string
  intensity: number
  condition: string | null
  sampleId: string | null
  biologicalReplicateId?: string | null
}

/**
 * Strip plot of per-region intensities for one ion, grouped by condition.
 * Loads data via the graphql `experimentIonIntensities` resolver, which proxies
 * the engine REST endpoint.
 */
export default defineComponent({
  name: 'IntensityStripPlot',
  props: {
    experimentId: { type: String, required: true },
    ionId: { type: Number as unknown as () => number | null, default: null },
    fdr: { type: Number as unknown as () => number | null, default: null },
  },
  setup(props) {
    const enabled = computed(() => props.ionId != null)
    const { result, loading, error } = useQuery(
      experimentIonIntensitiesQuery,
      () => ({ experimentId: props.experimentId, ionId: props.ionId ?? 0 }),
      () => ({ enabled: enabled.value, fetchPolicy: 'cache-and-network' as const })
    )

    const data = computed<IntensityRow[]>(() => result.value?.experimentIonIntensities ?? [])
    const conditions = computed(() =>
      Array.from(new Set(data.value.map((r) => r.condition).filter((c): c is string => !!c)))
    )

    const showSignificance = computed(() => props.fdr != null && props.fdr < 0.05 && conditions.value.length === 2)

    const option = computed(() => {
      const series = conditions.value.map((cond) => ({
        name: cond,
        type: 'scatter',
        symbolSize: 10,
        data: data.value
          .filter((r) => r.condition === cond)
          .map((r) => ({
            value: [cond, r.intensity],
            sampleId: r.sampleId,
            regionKey: r.regionKey,
          })),
        markLine: {
          symbol: 'none',
          lineStyle: { type: 'dashed', color: '#666' },
          data: [{ type: 'average', name: 'mean' }],
        },
      }))

      const yMax = data.value.length ? Math.max(...data.value.map((r) => r.intensity)) : 1
      const bracketY = yMax * 1.12

      const sigSeries =
        showSignificance.value && conditions.value.length === 2
          ? [
              {
                name: '*',
                type: 'scatter',
                data: [
                  {
                    value: [conditions.value[0], bracketY],
                    label: { show: true, formatter: '*', position: 'top' },
                    symbol: 'none',
                  },
                ],
                markLine: {
                  symbol: 'none',
                  lineStyle: { color: '#000' },
                  silent: true,
                  data: [[{ coord: [conditions.value[0], bracketY] }, { coord: [conditions.value[1], bracketY] }]],
                },
              },
            ]
          : []

      return {
        title: { text: 'Per-region intensity', textStyle: { fontSize: 13 } },
        tooltip: {
          trigger: 'item',
          formatter: (p: any) => `${p.data.sampleId} / ${p.data.regionKey}<br/>${p.data.value[1]}`,
        },
        legend: { top: 24 },
        grid: { left: 56, right: 16, top: 64, bottom: 40 },
        xAxis: { type: 'category', data: conditions.value },
        yAxis: { type: 'value', name: 'intensity' },
        series: [...series, ...sigSeries],
      }
    })

    return () => {
      if (props.ionId == null) {
        return (
          <div class="text-sm text-gray-400 p-4" data-test-key="strip-empty">
            Select a row to view per-region intensities.
          </div>
        )
      }
      if (loading.value && data.value.length === 0) {
        return (
          <div class="text-sm text-gray-400 p-4" data-test-key="strip-loading">
            Loading intensities…
          </div>
        )
      }
      if (error.value) {
        return (
          <div class="text-sm text-red-500 p-4" data-test-key="strip-error">
            {error.value.message}
          </div>
        )
      }
      return (
        <div data-test-key="strip-plot">
          <ECharts option={option.value} autoresize style="width: 100%; height: 320px" />
          {showSignificance.value && (
            <div class="hidden" data-test-key="strip-significance">
              significant
            </div>
          )}
        </div>
      )
    }
  },
})
