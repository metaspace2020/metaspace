import { defineComponent, ref, computed, inject } from 'vue'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { ElCard, ElCheckbox, ElMessage, ElEmpty } from '../../../lib/element-plus'
import { experimentRunQcQuery, updateExperimentExcludedSamplesMutation } from '../api'
import TicBarsChart from '../charts/TicBarsChart'
import DetectionRateChart from '../charts/DetectionRateChart'
import CvBoxPlot from '../charts/CvBoxPlot'
import PcaScatter from '../charts/PcaScatter'
import type { QcSampleRow } from '../charts/types'

/**
 * Stage 1: per-sample quality control.
 *
 * Reads the per-sample QC blob from `experimentRunQc` and renders both a
 * 2x2 grid of QC charts (TIC, detection rate, CV, PCA) and a checkbox grid
 * for explicit exclusion. Both UIs call the same `toggle(id)` so they stay
 * in sync — clicking a point in the PCA scatter excludes the sample exactly
 * like un-checking the corresponding checkbox.
 */
export default defineComponent({
  name: 'SampleQcStage',
  props: {
    experimentId: { type: String, required: true },
    initialExcluded: { type: Array as () => string[], default: () => [] },
  },
  setup(props) {
    const excluded = ref<Set<string>>(new Set(props.initialExcluded))

    const { result } = useQuery(experimentRunQcQuery, () => ({
      experimentId: props.experimentId,
    }))

    const qcRows = computed<QcSampleRow[]>(() => (result.value?.experimentRunQc?.samples ?? []) as QcSampleRow[])

    const pcaVariance = computed(() => {
      const v = (result.value?.experimentRunQc?.pcaVariance ?? {}) as { pc1?: number; pc2?: number }
      return { pc1: v.pc1 ?? 0, pc2: v.pc2 ?? 0 }
    })

    const samples = computed<string[]>(() => {
      const ids = new Set<string>()
      for (const row of qcRows.value) ids.add(row.sampleId)
      return Array.from(ids).sort()
    })

    const apolloClient: any = inject(DefaultApolloClient)
    const updateExcluded = (variables: any): Promise<any> =>
      apolloClient.mutate({ mutation: updateExperimentExcludedSamplesMutation, variables })

    const toggle = async (id: string): Promise<void> => {
      const next = new Set(excluded.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      excluded.value = next
      try {
        await updateExcluded({ experimentId: props.experimentId, excludedSamples: Array.from(next) })
        ElMessage.success('Excluded samples updated')
      } catch (e: any) {
        ElMessage.error(e?.message ?? 'Update failed')
      }
    }

    return () => (
      <ElCard data-test-key="sample-qc-stage">
        <h3 class="text-lg mb-4">Sample quality control</h3>
        <p class="text-sm text-gray-500 mb-4">
          Toggle samples to exclude from the analysis. Changes re-run the test phase.
        </p>
        {samples.value.length === 0 ? (
          <ElEmpty description="No sample data yet" />
        ) : (
          <>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4" data-test-key="qc-charts">
              <TicBarsChart samples={qcRows.value} />
              <DetectionRateChart samples={qcRows.value} />
              <CvBoxPlot samples={qcRows.value} />
              <PcaScatter
                samples={qcRows.value}
                pcaVariance={pcaVariance.value}
                {...{ onExclude: (id: string) => toggle(id) }}
              />
            </div>
            <h4 class="text-base font-medium mb-1">Samples</h4>
            <p class="text-sm text-gray-500 mb-2">Uncheck to exclude from analysis.</p>
            <div class="grid gap-2" data-test-key="samples-list">
              {samples.value.map((id) => (
                <ElCheckbox
                  key={id}
                  modelValue={!excluded.value.has(id)}
                  onChange={() => toggle(id)}
                  data-test-key={`sample-${id}`}
                >
                  {id}
                </ElCheckbox>
              ))}
            </div>
          </>
        )}
      </ElCard>
    )
  },
})
