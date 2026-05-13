import { defineComponent, ref, watch, computed, onMounted } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { ElCard, ElForm, ElFormItem, ElSelect, ElOption, ElInputNumber } from '../../../lib/element-plus'
import { experimentRunQcQuery } from '../api'
import FilterChainWaterfall from '../charts/FilterChainWaterfall'
import CoverageBars from '../charts/CoverageBars'
import type { FilterChainStep, CoverageMap, AllIonRow } from '../charts/types'
import type { CoverageRow } from '../charts/CoverageBars'

export interface ExperimentFilters {
  fdr: number
  minDetectionRate: number
  databases: string[]
  adducts: string[]
}

/**
 * Stage 2: filter panel + filter-chain waterfall + per-sample coverage.
 *
 * Holds analysis-level display filters (FDR threshold, minimum detection
 * rate, annotation databases, adducts) as **local component state**. Changes
 * are emitted via `update:filters` so the parent can re-issue the
 * `experimentResults` query with the new filter argument. No server mutation
 * is performed; the engine run is independent of these query-time filters.
 *
 * Reads `filterChain` and `coverage` from `experimentRunQc` to surface how
 * many ions survive each filter step and which samples are under-covered.
 */
export default defineComponent({
  name: 'ExploreStage',
  props: {
    experimentId: { type: String, required: true },
    initialFilters: { type: Object as () => Partial<ExperimentFilters> | null, default: null },
    /** Current Stage-1 exclusion list. The QC blob persists the last run's full
     *  sample set; we filter the coverage chart client-side by this list so the
     *  user sees what the next stats-only run will actually analyze. */
    excludedSamples: { type: Array as () => string[], default: () => [] },
  },
  emits: ['update:filters'],
  setup(props, { emit }) {
    const fdr = ref<number>(props.initialFilters?.fdr ?? 0.1)
    const minDetectionRate = ref<number>(props.initialFilters?.minDetectionRate ?? 0)
    const databases = ref<string[]>(props.initialFilters?.databases ?? [])
    const adducts = ref<string[]>(props.initialFilters?.adducts ?? [])

    // const buildFilters = (): ExperimentFilters => ({
    //   fdr: fdr.value,
    //   minDetectionRate: minDetectionRate.value,
    //   databases: databases.value,
    //   adducts: adducts.value,
    // })

    /** Translate the form shape to the `ExperimentResultsFilter` input shape
     *  the graphql resolver expects: `{ fdrMax, minDetectionRate, databases (moldb_id[]), adducts }`. */
    const buildResolverFilter = (): Record<string, unknown> => {
      const out: Record<string, unknown> = {}
      if (fdr.value != null) out.fdrMax = fdr.value
      if (minDetectionRate.value > 0) out.minDetectionRate = minDetectionRate.value
      if (adducts.value.length) out.adducts = [...adducts.value]
      if (databases.value.length) {
        const nameToId = new Map<string, number>()
        for (const ion of allIons.value) {
          if (ion.moldb_name && ion.moldb_id != null) nameToId.set(ion.moldb_name, ion.moldb_id)
        }
        const ids = databases.value.map((n) => nameToId.get(n)).filter((v): v is number => v != null)
        if (ids.length) out.databases = ids
      }
      return out
    }

    /** Auto-publish the current filter shape upward whenever the form changes
     *  (and once on mount), so the parent's `currentFilters` is always in sync
     *  and the Stage 2→3 transition can navigate immediately without a
     *  separate "Apply" step. */
    const emitFilters = (): void => {
      emit('update:filters', buildResolverFilter())
    }
    onMounted(() => emitFilters())
    watch([fdr, minDetectionRate, databases, adducts], () => emitFilters(), { deep: true })

    watch(
      () => props.initialFilters,
      (f) => {
        if (!f) return
        if (f.fdr != null) fdr.value = f.fdr
        if (f.minDetectionRate != null) minDetectionRate.value = f.minDetectionRate
        if (f.databases) databases.value = f.databases
        if (f.adducts) adducts.value = f.adducts
      },
      { deep: true }
    )

    const { result } = useQuery(experimentRunQcQuery, () => ({ experimentId: props.experimentId }))

    const precomputedChain = computed<FilterChainStep[]>(
      () => (result.value?.experimentRunQc?.filterChain ?? []) as FilterChainStep[]
    )
    const allIons = computed<AllIonRow[]>(() => (result.value?.experimentRunQc?.allIons ?? []) as AllIonRow[])

    /**
     * Recompute the filter chain client-side from `allIons` whenever the
     * form values change. Falls back to the precomputed chain from the run
     * (older runs / missing snapshot).
     */
    const filterChain = computed<FilterChainStep[]>(() => {
      const all = allIons.value
      if (!all || all.length === 0) return precomputedChain.value
      const fdrV = fdr.value
      const dbs = databases.value
      const adds = adducts.value
      const minDR = minDetectionRate.value
      const steps: FilterChainStep[] = [{ name: 'All annotated ions', count: all.length, droppedFromPrev: 0 }]
      let cur: AllIonRow[] = all
      if (fdrV != null) {
        const before = cur.length
        cur = cur.filter((r) => r.fdr != null && (r.fdr as number) <= fdrV)
        steps.push({
          name: `+FDR <= ${(fdrV * 100).toFixed(0)}%`,
          count: cur.length,
          droppedFromPrev: before - cur.length,
        })
      }
      if (dbs && dbs.length) {
        const before = cur.length
        const allow = new Set(dbs)
        cur = cur.filter((r) => r.moldb_name != null && allow.has(r.moldb_name as string))
        steps.push({
          name: `+database in {${dbs.join(', ')}}`,
          count: cur.length,
          droppedFromPrev: before - cur.length,
        })
      }
      if (adds && adds.length) {
        const before = cur.length
        const allow = new Set(adds)
        cur = cur.filter((r) => allow.has(r.adduct))
        steps.push({
          name: `+adduct in {${adds.join(', ')}}`,
          count: cur.length,
          droppedFromPrev: before - cur.length,
        })
      }
      if (minDR > 0) {
        const before = cur.length
        cur = cur.filter((r) => r.detection_rate >= minDR)
        steps.push({
          name: `+detection >= ${(minDR * 100).toFixed(0)}%`,
          count: cur.length,
          droppedFromPrev: before - cur.length,
        })
      }
      return steps
    })
    const coverageRows = computed<CoverageRow[]>(() => {
      const cov = (result.value?.experimentRunQc?.coverage ?? {}) as CoverageMap
      const samples = (result.value?.experimentRunQc?.samples ?? []) as Array<{
        regionKey: string
        sampleId: string
      }>
      const sampleByKey = new Map(samples.map((s) => [s.regionKey, s.sampleId]))
      const excluded = new Set(props.excludedSamples ?? [])
      return Object.entries(cov)
        .map(([regionKey, v]) => ({
          regionKey,
          sampleId: sampleByKey.get(regionKey) ?? regionKey,
          detected: v.detected,
          total: v.total,
        }))
        .filter((row) => !excluded.has(row.sampleId))
    })
    const ionsEnteringTest = computed<number>(() => {
      const chain = filterChain.value
      return chain.length === 0 ? 0 : chain[chain.length - 1]?.count ?? 0
    })
    const hasQc = computed<boolean>(() => result.value?.experimentRunQc != null)

    return () => (
      <div class="explore-stage grid grid-cols-1 lg:grid-cols-3 gap-4" data-test-key="explore-stage">
        <div class="lg:col-span-2 flex flex-col gap-4">
          <ElCard>
            <div class="flex items-baseline justify-between">
              <h4 class="text-base font-medium">Ions entering test</h4>
              <span class="text-3xl font-semibold text-blue-600" data-test-key="ions-entering-test">
                {ionsEnteringTest.value}
              </span>
            </div>
          </ElCard>
          <ElCard>
            {hasQc.value ? (
              <FilterChainWaterfall steps={filterChain.value} />
            ) : (
              <div class="text-sm text-gray-400 p-4" data-test-key="explore-empty">
                No QC data yet.
              </div>
            )}
          </ElCard>
          <ElCard>
            <CoverageBars rows={coverageRows.value} />
          </ElCard>
        </div>
        <ElCard>
          <h3 class="text-lg mb-4">Filters</h3>
          <ElForm labelPosition="top">
            <ElFormItem label="FDR threshold">
              <ElSelect v-model={fdr.value} class="w-32" data-test-key="filter-fdr">
                <ElOption label="5%" value={0.05} />
                <ElOption label="10%" value={0.1} />
                <ElOption label="20%" value={0.2} />
                <ElOption label="50%" value={0.5} />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="Min detection rate">
              <ElInputNumber v-model={minDetectionRate.value} min={0} max={1} step={0.05} />
            </ElFormItem>
            <ElFormItem label="Annotation databases">
              <ElSelect v-model={databases.value} multiple placeholder="HMDB, LipidMaps, …" class="w-full">
                <ElOption label="HMDB" value="HMDB" />
                <ElOption label="LipidMaps" value="LipidMaps" />
                <ElOption label="CoreMetabolome" value="CoreMetabolome" />
                <ElOption label="ChEBI" value="ChEBI" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="Adducts">
              <ElSelect v-model={adducts.value} multiple class="w-full">
                {['+H', '+Na', '+K', '-H', '+Cl'].map((a) => (
                  <ElOption key={a} label={a} value={a} />
                ))}
              </ElSelect>
            </ElFormItem>
          </ElForm>
        </ElCard>
      </div>
    )
  },
})
