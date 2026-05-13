import { defineComponent, ref, computed, inject, watch } from 'vue'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { ElCard, ElSelect, ElOption, ElMessage, ElEmpty } from '../../../lib/element-plus'
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
    /** sampleId → human-readable label (dataset name). Falls back to the
     *  sampleId itself for entries not in the map. */
    sampleLabels: { type: Object as () => Record<string, string>, default: () => ({}) },
    /** When true, the experiment's run is still PREP/RUNNING. The stage polls
     *  the QC query while this holds so charts refresh as soon as the
     *  re-triggered run lands new QC data. */
    inProgress: { type: Boolean, default: false },
  },
  emits: ['update:excludedSamples'],
  setup(props, { emit }) {
    const excluded = ref<Set<string>>(new Set(props.initialExcluded))
    /** Mirror the local exclusion set upward so the parent can compute
     *  `isResultsDirty` for the stats-only re-run flow. */
    /** Always emit a plain `Array<string>` — never the underlying `Set`. Some
     *  downstream consumers (Apollo cache key serialisation, GraphQL variable
     *  encoding, ElMessage `.toString()` fallbacks) call coercion on the
     *  payload and a `Set` throws "Cannot convert to primitive value". */
    const emitExcluded = (): void => {
      emit('update:excludedSamples', Array.from(excluded.value))
    }
    emitExcluded()
    watch(excluded, () => emitExcluded(), { deep: true })
    const labelFor = (id: string): string => props.sampleLabels[id] ?? id

    const qcQuery: any = useQuery(
      experimentRunQcQuery,
      () => ({ experimentId: props.experimentId }),
      () => ({ pollInterval: props.inProgress ? 3000 : 0 })
    )
    const { result, refetch, startPolling, stopPolling } = qcQuery

    /** Mirror the parent's status polling on the QC query: poll while the run
     *  is in progress, and refetch once when it settles so the charts pick up
     *  the new QC blob written by the just-finished run. */
    watch(
      () => props.inProgress,
      (ip, prev) => {
        if (ip) {
          if (typeof startPolling === 'function') startPolling(3000)
        } else {
          if (typeof stopPolling === 'function') stopPolling()
          if (prev && typeof refetch === 'function') refetch()
        }
      }
    )

    const allQcRows = computed<QcSampleRow[]>(() => (result.value?.experimentRunQc?.samples ?? []) as QcSampleRow[])

    /** Charts render filtered rows: excluded samples disappear from TIC /
     *  detection-rate / CV / PCA as soon as the tag is added. The full row
     *  list is preserved in `allQcRows` so the exclude dropdown can still
     *  list every sampleId (you have to be able to un-exclude). */
    const qcRows = computed<QcSampleRow[]>(() => allQcRows.value.filter((r) => !excluded.value.has(r.sampleId)))

    const pcaVariance = computed(() => {
      const v = (result.value?.experimentRunQc?.pcaVariance ?? {}) as { pc1?: number; pc2?: number }
      return { pc1: v.pc1 ?? 0, pc2: v.pc2 ?? 0 }
    })

    const samples = computed<string[]>(() => {
      const ids = new Set<string>()
      for (const row of allQcRows.value) ids.add(row.sampleId)
      return Array.from(ids).sort()
    })

    const apolloClient: any = inject(DefaultApolloClient)
    const updateExcluded = (variables: any): Promise<any> =>
      apolloClient.mutate({ mutation: updateExperimentExcludedSamplesMutation, variables })

    const setsEqual = (a: Set<string>, b: Set<string>): boolean => {
      if (a.size !== b.size) return false
      for (const x of a) if (!b.has(x)) return false
      return true
    }

    /** Coerce arbitrary Apollo / network errors to a printable string. Avoids
     *  ElMessage being handed an object whose `toString`/`Symbol.toPrimitive`
     *  throws ("Cannot convert object to primitive value"). */
    const errorMessage = (e: unknown): string => {
      if (e == null) return 'Update failed'
      if (typeof e === 'string') return e
      const anyE = e as any
      const candidates = [anyE?.message, anyE?.graphQLErrors?.[0]?.message, anyE?.networkError?.message]
      for (const c of candidates) {
        if (typeof c === 'string' && c) return c
      }
      try {
        return JSON.stringify(e)
      } catch {
        return 'Update failed'
      }
    }

    const persistExcluded = async (next: Set<string>): Promise<void> => {
      // Skip the mutation entirely if the selection didn't actually change.
      // ElSelect re-emits `update:modelValue` with a fresh array reference on
      // mount / props update; without this guard every visit to the page
      // would re-trigger `updateExperimentExcludedSamples`, which calls
      // `submitExperimentRun` server-side and bounces the run back to
      // PREPARING.
      if (setsEqual(excluded.value, next)) return
      excluded.value = next
      try {
        await updateExcluded({ experimentId: props.experimentId, excludedSamples: Array.from(next) })
        ElMessage.success('Excluded samples updated')
      } catch (e: unknown) {
        ElMessage.error(errorMessage(e))
      }
    }

    const toggle = (id: string): Promise<void> => {
      const next = new Set(excluded.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return persistExcluded(next)
    }

    const setExcluded = (ids: string[] | Set<string>): Promise<void> =>
      persistExcluded(new Set(Array.from(ids as Iterable<string>)))

    return () => (
      <ElCard data-test-key="sample-qc-stage">
        <h3 class="text-lg mb-1">Sample quality control</h3>
        <p class="text-sm text-gray-500 mb-4">
          Review sample-level metrics before filtering ions. Exclude outliers directly from any plot.
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
            <h4 class="text-base font-medium mb-1">Excluded samples</h4>
            <p class="text-sm text-gray-500 mb-2">Add samples to exclude from the analysis.</p>
            <ElSelect
              multiple
              filterable
              clearable
              placeholder="Select samples to exclude…"
              class="w-full max-w-xl"
              modelValue={Array.from(excluded.value)}
              {...{ 'onUpdate:modelValue': (ids: string[]) => setExcluded(ids) }}
              data-test-key="excluded-samples-select"
            >
              {samples.value.map((id) => (
                <ElOption key={id} label={labelFor(id)} value={id} />
              ))}
            </ElSelect>
          </>
        )}
      </ElCard>
    )
  },
})
