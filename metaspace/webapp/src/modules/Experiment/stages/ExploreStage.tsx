import { defineComponent, ref, watch, computed, onMounted } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { ElButton, ElCheckbox, ElIcon, ElSlider } from '../../../lib/element-plus'
import { Filter, TrendCharts, Download } from '@element-plus/icons-vue'
import { experimentRunQcQuery } from '../api'
import FilterChainWaterfall from '../charts/FilterChainWaterfall'
import CoverageBars from '../charts/CoverageBars'
import type { FilterChainStep, CoverageMap, AllIonRow } from '../charts/types'
import type { CoverageRow } from '../charts/CoverageBars'
import './ExploreStage.scss'

export interface ExperimentFilters {
  fdr: number
  minDetectionRate: number
  databases: string[]
  adducts: string[]
}

const ADDUCT_ORDER = ['+H', '+Na', '+K', '-H', '+Cl'] as const
const DEFAULT_FDR = 0.2
const FDR_OPTIONS: Array<{ value: number; label: string; cls: string }> = [
  { value: 0.05, label: '5%', cls: 'fdr-5' },
  { value: 0.1, label: '10%', cls: 'fdr-10' },
  { value: 0.2, label: '20%', cls: 'fdr-20' },
  { value: 0.5, label: '50%', cls: 'fdr-50' },
]

/**
 * Stage 2: filter panel + filter-chain waterfall + per-sample coverage.
 *
 * Holds analysis-level display filters as local component state, restored from
 * `initialFilters` (form-shape). The parent persists the same form-shape under
 * `currentFormFilters` and feeds it back on remount, so selections survive
 * navigating to Stage 3 and back. Resolver-shape filters are emitted via
 * `update:filters` for the results query; form-shape is emitted via
 * `update:formFilters` for the parent to persist.
 */
export default defineComponent({
  name: 'ExploreStage',
  props: {
    experimentId: { type: String, required: true },
    initialFilters: { type: Object as () => Partial<ExperimentFilters> | null, default: null },
    excludedSamples: { type: Array as () => string[], default: () => [] },
    /** sampleId → dataset display name; used to label coverage bars. */
    sampleLabels: { type: Object as () => Record<string, string>, default: () => ({}) },
  },
  emits: ['update:filters', 'update:formFilters'],
  setup(props, { emit }) {
    /** Defensive: `initialFilters` is form-shape, but a caller might pass the
     *  resolver shape (`databases: number[]`) by accident — coerce to string
     *  so downstream code that does `.startsWith` / `.includes(<name>)` can't
     *  blow up. Numeric entries become `db:<id>` to round-trip through the
     *  same path the rest of the component uses for unnamed moldbs. */
    const coerceDbList = (xs: unknown): string[] => {
      if (!Array.isArray(xs)) return []
      return xs.map((x) => (typeof x === 'string' ? x : `db:${x}`))
    }
    const fdr = ref<number>(props.initialFilters?.fdr ?? DEFAULT_FDR)
    const minDetectionRate = ref<number>(props.initialFilters?.minDetectionRate ?? 0)
    const databases = ref<string[]>(coerceDbList(props.initialFilters?.databases))
    const adducts = ref<string[]>(
      Array.isArray(props.initialFilters?.adducts) ? (props.initialFilters!.adducts as string[]).map(String) : []
    )
    /** Per-dimension "user has already chosen something" flags. Track DBs and
     *  adducts independently — restoring saved adducts from the server (the
     *  case after a page refresh) must not block databases from being
     *  auto-filled from the data, since the server-saved resolver-shape
     *  filter can't carry DB *names* and ExploreStage starts with an empty
     *  database list in that situation. */
    const dbsUserChosen = ref<boolean>((props.initialFilters?.databases?.length ?? 0) > 0)
    const adductsUserChosen = ref<boolean>((props.initialFilters?.adducts?.length ?? 0) > 0)

    const { result } = useQuery(experimentRunQcQuery, () => ({ experimentId: props.experimentId }))

    const precomputedChain = computed<FilterChainStep[]>(
      () => (result.value?.experimentRunQc?.filterChain ?? []) as FilterChainStep[]
    )
    const allIons = computed<AllIonRow[]>(() => (result.value?.experimentRunQc?.allIons ?? []) as AllIonRow[])

    /** Distinct databases present in the data. Names from `moldb_name` if
     *  available; falls back to `db:<moldb_id>` so older QC blobs without the
     *  joined name still surface as selectable rows. Unions in the user's
     *  current selection so a stats-only re-run that wipes `allIons` (the
     *  blob the backend rewrites without the snapshot) doesn't drop the
     *  previously-shown DB chips. */
    const availableDatabases = computed<string[]>(() => {
      const set = new Set<string>()
      for (const r of allIons.value) {
        const name = (r.moldb_name as string | null | undefined) ?? (r.moldb_id != null ? `db:${r.moldb_id}` : null)
        if (name) set.add(name)
      }
      for (const d of databases.value) set.add(d)
      return [...set].sort()
    })
    const availableAdducts = computed<string[]>(() => {
      const set = new Set<string>()
      for (const r of allIons.value) if (r.adduct) set.add(r.adduct)
      for (const a of adducts.value) set.add(a)
      const list = [...set]
      const orderIdx = (a: string): number => {
        const i = ADDUCT_ORDER.indexOf(a as (typeof ADDUCT_ORDER)[number])
        return i === -1 ? 999 : i
      }
      return list.sort((a, b) => orderIdx(a) - orderIdx(b) || a.localeCompare(b))
    })

    /** When data first arrives and the user has no persisted selection, default
     *  to "all databases / adducts selected" so the filter chain starts at the
     *  full ion set rather than zero. */
    watch(
      [availableDatabases, availableAdducts],
      ([dbs, adds]) => {
        if (!dbsUserChosen.value && dbs.length > 0 && databases.value.length === 0) {
          databases.value = [...dbs]
          dbsUserChosen.value = true
        }
        if (!adductsUserChosen.value && adds.length > 0 && adducts.value.length === 0) {
          adducts.value = [...adds]
          adductsUserChosen.value = true
        }
      },
      { immediate: true }
    )

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
        const ids: number[] = []
        for (const n of databases.value) {
          if (n.startsWith('db:')) {
            const id = Number(n.slice(3))
            if (Number.isFinite(id)) ids.push(id)
          } else {
            const id = nameToId.get(n)
            if (id != null) ids.push(id)
          }
        }
        if (ids.length) out.databases = ids
      }
      return out
    }

    const buildFormFilter = (): ExperimentFilters => ({
      fdr: fdr.value,
      minDetectionRate: minDetectionRate.value,
      databases: [...databases.value],
      adducts: [...adducts.value],
    })

    const emitFilters = (): void => {
      emit('update:filters', buildResolverFilter())
      emit('update:formFilters', buildFormFilter())
    }
    onMounted(() => emitFilters())
    watch([fdr, minDetectionRate, databases, adducts], () => emitFilters(), { deep: true })

    const sameStringList = (a: readonly string[], b: readonly string[]): boolean => {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
      return true
    }
    watch(
      () => props.initialFilters,
      (f) => {
        if (!f) return
        if (f.fdr != null && f.fdr !== fdr.value) fdr.value = f.fdr
        if (f.minDetectionRate != null && f.minDetectionRate !== minDetectionRate.value) {
          minDetectionRate.value = f.minDetectionRate
        }
        if (f.databases && !sameStringList(databases.value, f.databases)) {
          databases.value = [...f.databases]
        }
        if (f.adducts && !sameStringList(adducts.value, f.adducts)) {
          adducts.value = [...f.adducts]
        }
      },
      { deep: true }
    )

    const dbKey = (r: AllIonRow): string | null =>
      (r.moldb_name as string | null | undefined) ?? (r.moldb_id != null ? `db:${r.moldb_id}` : null)

    /** Apply the active filters to `allIons`, with the option to skip one
     *  dimension. Used to compute intersection-aware counts next to each
     *  checkbox: a DB row's count reflects FDR + adducts + min-DR (NOT
     *  databases), so toggling the DB on/off can never make its own count
     *  disappear. Same for adducts. */
    const filterIons = (skip: 'db' | 'adduct' | null): AllIonRow[] => {
      const fdrV = fdr.value
      const dbs = databases.value
      const adds = adducts.value
      const minDR = minDetectionRate.value
      const allowDb = new Set(dbs)
      const allowAd = new Set(adds)
      return allIons.value.filter((r) => {
        if (r.fdr == null || (r.fdr as number) > fdrV) return false
        if (skip !== 'db' && dbs.length) {
          const k = dbKey(r)
          if (k == null || !allowDb.has(k)) return false
        }
        if (skip !== 'adduct' && adds.length) {
          if (!allowAd.has(r.adduct)) return false
        }
        if (minDR > 0 && r.detection_rate < minDR) return false
        return true
      })
    }

    const databaseCounts = computed<Record<string, number>>(() => {
      const out: Record<string, number> = {}
      for (const r of filterIons('db')) {
        const k = dbKey(r)
        if (k) out[k] = (out[k] ?? 0) + 1
      }
      return out
    })
    const adductCounts = computed<Record<string, number>>(() => {
      const out: Record<string, number> = {}
      for (const r of filterIons('adduct')) out[r.adduct] = (out[r.adduct] ?? 0) + 1
      return out
    })

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
        cur = cur.filter((r) => {
          const k = dbKey(r)
          return k != null && allow.has(k)
        })
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
        condition: string | null
      }>
      const byKey = new Map(samples.map((s) => [s.regionKey, s]))
      const excluded = new Set(props.excludedSamples ?? [])
      return Object.entries(cov)
        .map(([regionKey, v]) => {
          const s = byKey.get(regionKey)
          const sampleId = s?.sampleId ?? regionKey
          return {
            regionKey,
            sampleId,
            label: props.sampleLabels[sampleId] ?? sampleId,
            condition: s?.condition ?? null,
            detected: v.detected,
            total: v.total,
          }
        })
        .filter((row) => !excluded.has(row.sampleId))
    })
    /** Distinct conditions present (after excluding QC drops), preserving the
     *  first-seen order of `samples` for stable colour assignment. */
    const conditionsInOrder = computed<string[]>(() => {
      const samples = (result.value?.experimentRunQc?.samples ?? []) as Array<{
        sampleId: string
        condition: string | null
      }>
      const excluded = new Set(props.excludedSamples ?? [])
      const seen: string[] = []
      const set = new Set<string>()
      for (const s of samples) {
        if (excluded.has(s.sampleId)) continue
        const c = s.condition || '(no condition)'
        if (!set.has(c)) {
          set.add(c)
          seen.push(c)
        }
      }
      return seen
    })

    /** Categorical palette. First two slots intentionally match the design
     *  mockup (purple/teal) for the common two-condition case; extra slots
     *  fall back to a generic categorical set. */
    const CONDITION_PALETTE = ['#8b5cf6', '#14b8a6', '#f59e0b', '#3b82f6', '#ef4444', '#84cc16', '#ec4899', '#6366f1']
    const conditionColors = computed<Record<string, string>>(() => {
      const out: Record<string, string> = {}
      conditionsInOrder.value.forEach((c, i) => {
        out[c] = CONDITION_PALETTE[i % CONDITION_PALETTE.length]
      })
      return out
    })
    const sampleCount = computed<number>(() => {
      const samples = (result.value?.experimentRunQc?.samples ?? []) as Array<{ sampleId: string }>
      const excluded = new Set(props.excludedSamples ?? [])
      return samples.filter((s) => !excluded.has(s.sampleId)).length
    })
    const ionsEnteringTest = computed<number>(() => {
      const chain = filterChain.value
      return chain.length === 0 ? 0 : chain[chain.length - 1]?.count ?? 0
    })
    const hasQc = computed<boolean>(() => result.value?.experimentRunQc != null)

    const toggleDb = (name: string, checked: boolean): void => {
      const cur = new Set(databases.value)
      if (checked) cur.add(name)
      else cur.delete(name)
      databases.value = [...cur]
    }
    const toggleAdduct = (name: string, checked: boolean): void => {
      const cur = new Set(adducts.value)
      if (checked) cur.add(name)
      else cur.delete(name)
      adducts.value = [...cur]
    }
    const resetFilters = (): void => {
      fdr.value = DEFAULT_FDR
      minDetectionRate.value = 0
      databases.value = [...availableDatabases.value]
      adducts.value = [...availableAdducts.value]
    }

    const detectionPct = computed<number>({
      get: () => Math.round(minDetectionRate.value * 100),
      set: (v) => {
        minDetectionRate.value = Math.max(0, Math.min(100, v)) / 100
      },
    })

    const totalIons = computed<number>(() => allIons.value.length)

    return () => {
      const conds = conditionsInOrder.value
      const colors = conditionColors.value
      return (
        <div class="explore-stage" data-test-key="explore-stage">
          <header class="explore-header">
            <h2 class="page-title">Explore ion coverage and configure analysis</h2>
            <p class="page-subtitle">
              Preview which ions will enter the statistical test. Filters update the heatmap and the ion count in real
              time
            </p>
          </header>

          <div class="explore-grid">
            <div class="explore-main">
              <div class="panel">
                <div class="panel-header">
                  <div>
                    <h4>Filter impact</h4>
                    <p class="panel-subtitle">
                      How filters narrow the test set, and what coverage remains in each sample
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <ElButton size="small" onClick={resetFilters} data-test-key="reset-filters">
                      Reset filters
                    </ElButton>
                    <ElIcon class="text-gray-400 cursor-pointer">
                      <Download />
                    </ElIcon>
                  </div>
                </div>
                <div class="chart-header">
                  <ElIcon>
                    <Filter />
                  </ElIcon>
                  <span>Filter chain</span>
                </div>
                <p class="chart-subtitle">Each filter is applied in order. Click any row to inspect dropped ions.</p>
                {hasQc.value ? (
                  <FilterChainWaterfall steps={filterChain.value} />
                ) : (
                  <div class="text-sm text-gray-400 p-4" data-test-key="explore-empty">
                    No QC data yet.
                  </div>
                )}
                <span class="hidden" data-test-key="ions-entering-test">
                  {ionsEnteringTest.value}
                </span>
              </div>

              <div class="panel">
                <div class="panel-header">
                  <div>
                    <div class="chart-header">
                      <ElIcon>
                        <TrendCharts />
                      </ElIcon>
                      <span>Coverage per sample</span>
                    </div>
                    <p class="chart-subtitle">
                      Of the {ionsEnteringTest.value.toLocaleString()} filtered ions, how many are detected in each
                      sample.
                    </p>
                  </div>
                  <div class="legend">
                    {conds.map((c) => (
                      <span key={c}>
                        <span class="legend-dot" style={`background:${colors[c]}`} /> {c}
                      </span>
                    ))}
                  </div>
                </div>
                <CoverageBars rows={coverageRows.value} groupByCondition conditionColors={colors} />
              </div>
            </div>

            <aside class="filters-panel panel">
              <div class="filters-header">
                <h3>Filters</h3>
                <ElButton size="small" onClick={resetFilters}>
                  Reset
                </ElButton>
              </div>

              <div class="filter-section">
                <div class="filter-section-header">
                  <span class="filter-label">Min detection rate</span>
                  <span class="filter-value">{detectionPct.value > 0 ? `≥ ${detectionPct.value}%` : '—'}</span>
                </div>
                <div class="filter-sublabel">Per condition</div>
                <ElSlider
                  v-model={detectionPct.value}
                  min={0}
                  max={100}
                  step={5}
                  showTooltip={false}
                  data-test-key="filter-min-detection"
                />
              </div>

              <div class="filter-section">
                <div class="filter-label mb-2">Annotation database</div>
                {availableDatabases.value.length === 0 ? (
                  <div class="text-xs text-gray-400">No databases available.</div>
                ) : (
                  availableDatabases.value.map((db) => (
                    <div class="checkbox-row" key={db}>
                      <ElCheckbox
                        modelValue={databases.value.includes(db)}
                        onChange={(v: boolean | string | number) => toggleDb(db, Boolean(v))}
                        label={db}
                      />
                      <span class="count">{(databaseCounts.value[db] ?? 0).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>

              <div class="filter-section">
                <div class="filter-label mb-2">Adducts</div>
                {availableAdducts.value.length === 0 ? (
                  <div class="text-xs text-gray-400">No adducts available.</div>
                ) : (
                  availableAdducts.value.map((a) => (
                    <div class="checkbox-row" key={a}>
                      <ElCheckbox
                        modelValue={adducts.value.includes(a)}
                        onChange={(v: boolean | string | number) => toggleAdduct(a, Boolean(v))}
                        label={a}
                      />
                      <span class="count">{(adductCounts.value[a] ?? 0).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>

              <div class="filter-section">
                <div class="filter-label mb-2">FDR threshold</div>
                <div class="fdr-pills" data-test-key="filter-fdr">
                  {FDR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      class={['fdr-pill', opt.cls, fdr.value === opt.value ? 'is-active' : '']}
                      onClick={() => (fdr.value = opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div class="ions-entering-test">
                <div class="iet-label">Ions entering test</div>
                <div class="iet-number">{ionsEnteringTest.value.toLocaleString()}</div>
                <div class="iet-context">
                  on {sampleCount.value} samples · {conds.length} conditions
                  {totalIons.value > 0 && (
                    <span class="text-gray-400"> / {totalIons.value.toLocaleString()} total</span>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      )
    }
  },
})
