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

    // Mockup palette: first condition purple ("treated"), second teal ("control").
    const PALETTE = ['#7C5CC7', '#5CA98F', '#909399']

    const option = computed(() => {
      const series = conditions.value.map((cond, i) => {
        const color = PALETTE[i % PALETTE.length]
        const condCount = data.value.filter((r) => r.condition === cond).length
        return {
          name: `${cond} (n=${condCount})`,
          type: 'scatter',
          symbolSize: 12,
          itemStyle: { color, opacity: 0.9 },
          data: data.value
            .filter((r) => r.condition === cond)
            .map((r) => ({
              value: [cond, r.intensity],
              sampleId: r.sampleId,
              regionKey: r.regionKey,
            })),
          markLine: {
            symbol: 'none',
            lineStyle: { color, width: 2 },
            label: { show: false },
            data: [{ type: 'average' }],
          },
        }
      })

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
        tooltip: {
          trigger: 'item',
          formatter: (p: any) => `${p.data?.sampleId ?? ''}<br/>${p.data?.value?.[1] ?? ''}`,
        },
        legend: {
          top: 4,
          left: 8,
          textStyle: { fontSize: 11, color: '#606266' },
          itemWidth: 12,
          itemHeight: 12,
          icon: 'rect',
        },
        grid: { left: 56, right: 24, top: 40, bottom: 56 },
        xAxis: {
          type: 'category',
          data: conditions.value,
          axisLine: { lineStyle: { color: '#dcdfe6' } },
          axisLabel: {
            fontSize: 12,
            fontWeight: 500,
            color: (val: string) => {
              const idx = conditions.value.indexOf(val)
              return PALETTE[idx % PALETTE.length] ?? '#606266'
            },
          },
        },
        yAxis: {
          type: 'value',
          name: 'INTENSITY (NORM.)',
          nameLocation: 'middle',
          nameRotate: 90,
          nameGap: 48,
          nameTextStyle: { color: '#909399', fontSize: 10 },
          axisLine: { show: false },
          axisLabel: { color: '#606266', fontSize: 10 },
          splitLine: { lineStyle: { type: 'dashed', color: '#ebeef5' } },
        },
        series: [...series, ...sigSeries],
      }
    })

    return () => {
      if (props.ionId == null) {
        return (
          <div class="strip-plot-wrapper" data-test-key="strip-plot">
            <div class="text-sm text-gray-400 p-4" data-test-key="strip-empty">
              Select a row to view per-region intensities.
            </div>
          </div>
        )
      }
      // Defensive: some callers (page-level tests) mock useQuery without
      // an `error` ref. Treat the absence the same as no error.
      const err = error?.value
      if (err) {
        return (
          <div class="text-sm text-red-500 p-4" data-test-key="strip-error">
            {err.message}
          </div>
        )
      }
      // Keep ECharts mounted across ionId changes / refetches; the v-loading
      // overlay conveys the in-flight state without replacing the canvas with
      // a "Loading…" string (which caused visible flicker on row clicks).
      return (
        <div class="strip-plot-wrapper" data-test-key="strip-plot" v-loading={loading?.value ?? false}>
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
