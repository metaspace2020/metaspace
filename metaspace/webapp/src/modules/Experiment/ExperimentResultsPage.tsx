import { defineComponent, ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useMutation } from '@vue/apollo-composable'
import { ElButton, ElAlert, ElIcon, ElTag } from '../../lib/element-plus'
import { DataAnalysis, Search, Document, ArrowRight } from '@element-plus/icons-vue'
import { experimentRunStatusQuery, experimentResultsQuery, runExperimentStatsMutation } from './api'
import SampleQcStage from './stages/SampleQcStage'
import ExploreStage from './stages/ExploreStage'
import ResultsStage from './stages/ResultsStage'

const isInProgress = (s?: string | null): boolean =>
  s === 'QUEUED' || s === 'PREPARING' || s === 'RUNNING' || s === 'RUNNING_STATS'

/** Deep equal for plain JSON-ish filter objects (primitives, arrays, POJOs). */
const deepEqualPlain = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!deepEqualPlain(a[i], b[i])) return false
    return true
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a as Record<string, unknown>)
    const bk = Object.keys(b as Record<string, unknown>)
    if (ak.length !== bk.length) return false
    for (const k of ak) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false
      if (!deepEqualPlain((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false
    }
    return true
  }
  return false
}

type StageIdx = 0 | 1 | 2
const STAGES: Array<{ idx: StageIdx; caption: string; title: string; icon: any }> = [
  { idx: 0, caption: 'Stage 1', title: 'Sample QC', icon: DataAnalysis },
  { idx: 1, caption: 'Stage 2', title: 'Explore', icon: Search },
  { idx: 2, caption: 'Stage 3', title: 'Results', icon: Document },
]

export default defineComponent({
  name: 'ExperimentResultsPage',
  setup(_props, { expose }) {
    const route = useRoute()
    const router = useRouter()
    const id = route.params.id as string
    const projectId = route.params.projectId as string
    /** Stage is persisted in `?stage=` so a refresh keeps the user on the
     *  same stage. Clamp to [0, 2] in case of bad input. */
    const parseStage = (q: any): StageIdx => {
      const n = Number(q)
      if (n === 1 || n === 2) return n
      return 0
    }
    const stage = ref<StageIdx>(parseStage(route.query.stage))
    watch(stage, (s) => {
      if (parseStage(route.query.stage) === s) return
      router.replace({ query: { ...route.query, stage: String(s) } })
    })
    watch(
      () => route.query.stage,
      (q) => {
        const next = parseStage(q)
        if (next !== stage.value) stage.value = next
      }
    )
    const selectedRow = ref<Record<string, unknown> | null>(null)
    const currentFilters = ref<Record<string, unknown> | null>(null)
    /** Form-shape filters held by Stage 2's panel. Persisted at the parent so
     *  unmounting Stage 2 (when the user navigates to Stage 3) doesn't drop
     *  the user's selections — ExploreStage re-initializes from this prop on
     *  remount. */
    const currentFormFilters = ref<Record<string, unknown> | null>(null)
    const currentExcludedSamples = ref<string[]>([])

    const queryReturn: any = useQuery(experimentRunStatusQuery, () => ({ id }), { pollInterval: 3000 })
    const { result, stopPolling, startPolling } = queryReturn
    const exp = computed(() => result.value?.experiment ?? null)
    const runStatus = computed<string | null>(() => exp.value?.run?.status ?? null)

    /** Tiny probe of the results query just to know whether any results exist —
     *  needed for the initial-mount Stage 3 jump and unaffected by Stage 2's
     *  filter form (results are paginated; we only need >=1 row). */
    const resultsProbe: any = useQuery(experimentResultsQuery, () => ({
      experimentId: id,
      filter: null,
      orderBy: 'fdr ASC',
      limit: 1,
      offset: 0,
    }))
    const experimentResultsRows = computed<unknown[]>(() => resultsProbe.result?.value?.experimentResults ?? [])

    /** Adopt the persisted excluded-samples list as the parent's current value
     *  on first availability. Stage 1 owns subsequent edits and emits upward. */
    watch(
      () => exp.value?.run?.excludedSamples,
      (es) => {
        if (Array.isArray(es)) currentExcludedSamples.value = [...es]
      },
      { immediate: true }
    )

    const runStatsMutation: any = useMutation(runExperimentStatsMutation)
    const runExperimentStats = async (variables: {
      id: string
      filter: Record<string, unknown> | null
      excludedSamples: string[]
    }): Promise<unknown> => {
      const fn = runStatsMutation?.mutate
      if (typeof fn !== 'function') return null
      return fn(variables)
    }

    /** Only adopt `run.filters` from the server if it already has the resolver
     *  shape (`fdrMax` / `databases` as int[] / etc). Form-shape filters from
     *  older runs are ignored here so the resolver doesn't reject the query;
     *  the user can re-apply via Stage 2's form. */
    const isResolverFilterShape = (f: any): boolean =>
      f != null && (f.fdrMax !== undefined || (Array.isArray(f.databases) && typeof f.databases[0] === 'number'))

    /** Project the server-saved resolver-shape filter onto the form shape
     *  ExploreStage expects. We can't reverse-map numeric database IDs to
     *  names here (the name dictionary lives in `allIons`), so `databases`
     *  is left out — ExploreStage's auto-fill will populate it once the QC
     *  data arrives. FDR and adducts round-trip directly. */
    const deriveFormFromRun = (f: any): Record<string, unknown> | null => {
      if (f == null) return null
      const out: Record<string, unknown> = {}
      if (typeof f.fdrMax === 'number') out.fdr = f.fdrMax
      if (typeof f.fdr === 'number') out.fdr = f.fdr
      if (typeof f.minDetectionRate === 'number') out.minDetectionRate = f.minDetectionRate
      if (Array.isArray(f.adducts)) out.adducts = f.adducts.map(String)
      return Object.keys(out).length ? out : null
    }

    watch(
      () => exp.value?.run?.filters,
      (f) => {
        if (f && currentFilters.value === null && isResolverFilterShape(f)) {
          currentFilters.value = f as Record<string, unknown>
        }
      },
      { immediate: true }
    )

    watch(runStatus, (s) => {
      if (!isInProgress(s)) {
        if (typeof stopPolling === 'function') stopPolling()
      } else {
        if (typeof startPolling === 'function') startPolling(3000)
      }
    })

    const summary = computed(() => {
      const e = exp.value
      if (!e) return null
      const sampleIds = new Set<string>()
      const conditions = new Set<string>()
      for (const ed of e.datasets ?? []) {
        for (const r of ed.regions ?? []) {
          const m = r.metadata
          if (m?.sampleId) sampleIds.add(m.sampleId)
          if (m?.condition) conditions.add(m.condition)
        }
      }
      return {
        samples: sampleIds.size,
        conditions: conditions.size,
        regionLabels: (e.labelGroups ?? []).length,
      }
    })

    /** sampleId → dataset name. A sample belongs to exactly one dataset in
     *  practice, so first-wins is fine. Used to label exclude options with the
     *  human-readable dataset name instead of the raw metadata sampleId. */
    const sampleLabels = computed<Record<string, string>>(() => {
      const e = exp.value
      const map: Record<string, string> = {}
      if (!e) return map
      for (const ed of e.datasets ?? []) {
        const dsName: string | undefined = ed.dataset?.name
        if (!dsName) continue
        for (const r of ed.regions ?? []) {
          const sid = r.metadata?.sampleId
          if (sid && !(sid in map)) map[sid] = dsName
        }
      }
      return map
    })

    /** True when the user-facing Stage-1 excluded list or Stage-2 filter form
     *  has diverged from what's persisted on the server's run. Drives the
     *  Stage 3 stepper-item disable and gates the runExperimentStats call. */
    const isResultsDirty = computed<boolean>(() => {
      const savedFilter = (exp.value?.run?.filters ?? {}) as Record<string, unknown>
      const savedExcluded = new Set<string>(exp.value?.run?.excludedSamples ?? [])
      const curFilter = (currentFilters.value ?? {}) as Record<string, unknown>
      const curExcluded = new Set<string>(currentExcludedSamples.value ?? [])
      if (!deepEqualPlain(curFilter, savedFilter)) return true
      if (savedExcluded.size !== curExcluded.size) return true
      for (const s of curExcluded) if (!savedExcluded.has(s)) return true
      return false
    })

    const isStageDisabled = (s: StageIdx): boolean => {
      if (s === 2 && currentFilters.value == null) return true
      if (s === 2 && isResultsDirty.value) return true
      return false
    }

    /** The Next button on Stage 2 (`stage.value === 1`) MUST stay enabled when
     *  the user is dirty — clicking it fires `runExperimentStats`, which is the
     *  only way to clear the dirtiness and reach Stage 3. The stepper-item
     *  disable (`isStageDisabled`) prevents direct clicks on the Stage 3 item,
     *  but the Next button is the sanctioned mutation path and must remain
     *  clickable. The only gates on Next: a pending advance, or (from Stage 2)
     *  the absence of any filter configuration at all. */
    const isNextDisabled = computed<boolean>(() => {
      if (pendingAdvanceToResults.value) return true
      if (stage.value === 1) {
        if (currentFilters.value == null) return true
        // Require at least one database AND one adduct so the resolver doesn't
        // run on an empty set; the form-shape selection is authoritative here.
        const ff = currentFormFilters.value as { databases?: string[]; adducts?: string[] } | null
        if (!ff || (ff.databases?.length ?? 0) === 0 || (ff.adducts?.length ?? 0) === 0) return true
      }
      return false
    })

    /** One-shot: when the run is FINISHED, at least one result row already
     *  exists, AND the user has previously reached Stage 3 for this experiment
     *  (persisted in localStorage), jump the user straight to Stage 3 on first
     *  mount. First-ever visits always start at Stage 1, even when results are
     *  ready, so the user has a chance to review Stage 1 and Stage 2 first.
     *  Subsequent in-session navigation is user-driven. */
    const visitedStage3Key = `metaspace:experiment:${id}:visitedStage3`
    const readVisitedStage3 = (): boolean => {
      try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(visitedStage3Key) === '1'
      } catch {
        return false
      }
    }
    const markVisitedStage3 = (): void => {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(visitedStage3Key, '1')
      } catch {
        /* ignore SSR / sandboxed contexts */
      }
    }
    const didInitialStage = ref<boolean>(false)
    const tryInitialStage = (): void => {
      if (didInitialStage.value) return
      const e = exp.value
      if (!e) return
      didInitialStage.value = true
      if (readVisitedStage3() && e.run?.status === 'FINISHED' && experimentResultsRows.value.length > 0) {
        stage.value = 2
      }
    }
    watch([exp, experimentResultsRows], () => tryInitialStage(), { immediate: true })
    onMounted(() => tryInitialStage())
    // Persist the "user has reached Stage 3" flag whenever the user lands on
    // Stage 3 via any path (stepper click, Next, mutation-watcher flip, or the
    // initial-mount auto-jump above).
    watch(
      stage,
      (s) => {
        if (s === 2) markVisitedStage3()
      },
      { immediate: true }
    )

    const setStage = (s: StageIdx): void => {
      if (isStageDisabled(s)) return
      stage.value = s
    }

    /** When the user clicks Next from Stage 2 while the run is still in
     *  progress, hold the advance until the run finishes. The button shows a
     *  loading spinner in the meantime; the watch below flips the stage as
     *  soon as `inProgress` clears. */
    const pendingAdvanceToResults = ref<boolean>(false)
    watch(
      () => isInProgress(runStatus.value),
      (ip, prev) => {
        if (prev && !ip && pendingAdvanceToResults.value) {
          pendingAdvanceToResults.value = false
          // Bypass the dirty-disable for the pending case: the user explicitly
          // started this transition by clicking Next; the just-completed
          // stats-only run made saved == current. Still honour the "no filter
          // configured at all" guard.
          if (currentFilters.value != null) stage.value = 2
        }
      }
    )
    // Clear the pending flag if the user navigates away manually.
    watch(stage, (s) => {
      if (s !== 1) pendingAdvanceToResults.value = false
    })

    const onClickNext = async (): Promise<void> => {
      if (stage.value === 1) {
        if (isResultsDirty.value) {
          pendingAdvanceToResults.value = true
          try {
            await runExperimentStats({
              id,
              filter: currentFilters.value,
              excludedSamples: [...currentExcludedSamples.value],
            })
          } catch (err) {
            pendingAdvanceToResults.value = false
            throw err
          }
          return
        }
        if (isInProgress(runStatus.value)) {
          pendingAdvanceToResults.value = true
          return
        }
        stage.value = 2
        return
      }
      const target = (stage.value + 1) as StageIdx
      if (isStageDisabled(target)) return
      setStage(target)
    }

    const statusTagType = (s?: string | null): 'success' | 'danger' | 'info' | 'warning' => {
      if (s === 'FINISHED') return 'success'
      if (s === 'FAILED') return 'danger'
      if (isInProgress(s)) return 'warning'
      return 'info'
    }

    expose({
      get currentStage() {
        return stage.value
      },
      set currentStage(v: number) {
        stage.value = v as StageIdx
      },
      get isResultsDirty() {
        return isResultsDirty.value
      },
      get pendingAdvanceToResults() {
        return pendingAdvanceToResults.value
      },
      set pendingAdvanceToResults(v: boolean) {
        pendingAdvanceToResults.value = v
      },
      handleFilterChange: (f: Record<string, unknown>) => {
        currentFilters.value = f
      },
      handleExcludedSamplesChange: (ids: string[]) => {
        currentExcludedSamples.value = ids
      },
      onClickNext,
    })

    return () => {
      const e = exp.value
      if (!e) return <p>Loading…</p>
      const run = e.run
      const inProgress = isInProgress(run?.status)
      const sm = summary.value
      return (
        <div class="experiment-results-page p-4" data-test-key="experiment-results-page">
          <header class="flex justify-between items-start mb-6">
            <div>
              <div class="flex items-center gap-3">
                <h2 class="text-2xl font-semibold m-0">{e.name}</h2>
                <ElTag size="small" type={statusTagType(run?.status)} effect="plain">
                  {run?.status ?? 'NOT RUN'}
                </ElTag>
              </div>
              {sm && (
                <p class="text-sm text-gray-500 mt-1 mb-0">
                  {sm.samples} samples · {sm.conditions} conditions · {sm.regionLabels} region labels
                </p>
              )}
            </div>
            <ElButton onClick={() => router.push(`/project/${projectId}/experiment/${id}/edit`)}>
              Edit experiment
            </ElButton>
          </header>
          {run?.error && <ElAlert type="error" title="Run failed" description={run.error} class="mb-4" />}
          {inProgress && (
            <ElAlert
              type="info"
              title={`Run is ${run!.status}…`}
              description="This page will update automatically."
              class="mb-4"
            />
          )}

          <div
            class="flex items-stretch gap-2 bg-gray-50 rounded-lg p-3 mb-6"
            data-test-key="experiment-stepper"
            role="tablist"
          >
            {STAGES.map((s, i) => {
              const isActive = stage.value === s.idx
              const disabled = isStageDisabled(s.idx)
              const cardClass = [
                'flex-1 flex items-center gap-3 px-4 py-3 rounded-md transition-all select-none',
                disabled ? 'cursor-not-allowed opacity-50 text-gray-400' : 'cursor-pointer',
                isActive
                  ? 'bg-white shadow border border-gray-200 text-gray-900'
                  : disabled
                  ? ''
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/60',
              ].join(' ')
              return [
                <div
                  key={s.idx}
                  class={cardClass}
                  role="tab"
                  aria-selected={isActive}
                  aria-disabled={disabled}
                  title={disabled ? 'Configure filters in Stage 2 to enable Results' : undefined}
                  data-test-key={`stage-card-${s.idx}`}
                  onClick={() => setStage(s.idx)}
                >
                  <div
                    class={[
                      'w-8 h-8 rounded-full border flex items-center justify-center text-base font-medium shrink-0',
                      isActive ? 'border-gray-900 text-gray-900' : 'border-gray-400 text-gray-500',
                    ].join(' ')}
                  >
                    {s.idx + 1}
                  </div>
                  <ElIcon size={22} class={isActive ? 'text-gray-900' : 'text-gray-400'}>
                    <s.icon />
                  </ElIcon>
                  <div class="leading-tight">
                    <div class="text-xs text-gray-400">{s.caption}</div>
                    <div class={['text-base', isActive ? 'font-semibold' : 'font-medium'].join(' ')}>{s.title}</div>
                  </div>
                </div>,
                i < STAGES.length - 1 && (
                  <div class="flex items-center text-gray-300" aria-hidden="true">
                    <ElIcon size={20}>
                      <ArrowRight />
                    </ElIcon>
                  </div>
                ),
              ]
            })}
          </div>

          {stage.value === 0 && run && (
            <SampleQcStage
              experimentId={e.id}
              initialExcluded={run.excludedSamples ?? []}
              sampleLabels={sampleLabels.value}
              inProgress={inProgress}
              {...{
                'onUpdate:excludedSamples': (ids: string[] | Set<string>) => {
                  // Defensive: coerce to a plain Array<string>. A Set leaking
                  // up here would break Apollo variable serialisation and
                  // throw "Cannot convert to primitive value" downstream.
                  currentExcludedSamples.value = Array.from(ids as Iterable<string>)
                },
              }}
            />
          )}
          {stage.value === 1 && run && (
            <ExploreStage
              experimentId={e.id}
              initialFilters={currentFormFilters.value ?? (deriveFormFromRun(run.filters) as any)}
              excludedSamples={currentExcludedSamples.value}
              sampleLabels={sampleLabels.value}
              {...{
                'onUpdate:filters': (f: any) => (currentFilters.value = f),
                'onUpdate:formFilters': (f: any) => (currentFormFilters.value = f),
              }}
            />
          )}
          {stage.value === 2 && run && inProgress && (
            <ElAlert
              type="info"
              title="Results are being prepared…"
              description="Run still in progress. The page will update automatically once the results are ready."
              closable={false}
              data-test-key="results-preparing"
            />
          )}
          {stage.value === 2 && run && !inProgress && (
            <ResultsStage
              experimentId={e.id}
              filter={currentFilters.value}
              {...{
                'onUpdate:selectedRow': (r: Record<string, unknown>) => {
                  selectedRow.value = r
                },
              }}
            />
          )}
          <div class="flex justify-between mt-4">
            {stage.value > 0 ? (
              <ElButton onClick={() => setStage((stage.value - 1) as StageIdx)} data-test-key="stage-back">
                Back
              </ElButton>
            ) : (
              <span />
            )}
            {stage.value < 2 && (
              <ElButton
                type="primary"
                disabled={isNextDisabled.value}
                loading={pendingAdvanceToResults.value}
                onClick={onClickNext}
                data-test-key="stage-next"
              >
                {pendingAdvanceToResults.value ? 'Preparing results…' : 'Next stage'}
              </ElButton>
            )}
          </div>
        </div>
      )
    }
  },
})
