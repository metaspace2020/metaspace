import { defineComponent, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@vue/apollo-composable'
import { ElSteps, ElStep, ElButton, ElAlert } from '../../lib/element-plus'
import { experimentRunStatusQuery } from './api'
import SampleQcStage from './stages/SampleQcStage'
import ExploreStage from './stages/ExploreStage'
import ResultsStage from './stages/ResultsStage'

const isInProgress = (s?: string | null): boolean => s === 'QUEUED' || s === 'PREPARING' || s === 'RUNNING'

/**
 * Phase 3c: ExperimentResultsPage.
 *
 * Three-stage stepper (Sample QC, Explore, Results) backed by Apollo
 * queries and mutations. Polls `experimentRunStatusQuery` while the run
 * is in progress and stops polling once it terminates.
 */
export default defineComponent({
  name: 'ExperimentResultsPage',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const id = route.params.id as string
    const projectId = route.params.projectId as string
    /** Stage is persisted in `?stage=` so a refresh keeps the user on the
     *  same stage. Clamp to [0, 2] in case of bad input. */
    const parseStage = (q: any): 0 | 1 | 2 => {
      const n = Number(q)
      if (n === 1 || n === 2) return n
      return 0
    }
    const stage = ref<0 | 1 | 2>(parseStage(route.query.stage))
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

    const queryReturn: any = useQuery(experimentRunStatusQuery, () => ({ id }), { pollInterval: 3000 })
    const { result, stopPolling, startPolling } = queryReturn
    const exp = computed(() => result.value?.experiment ?? null)
    const runStatus = computed<string | null>(() => exp.value?.run?.status ?? null)

    /** Only adopt `run.filters` from the server if it already has the resolver
     *  shape (`fdrMax` / `databases` as int[] / etc). Form-shape filters from
     *  older runs are ignored here so the resolver doesn't reject the query;
     *  the user can re-apply via Stage 2's form. */
    const isResolverFilterShape = (f: any): boolean =>
      f != null && (f.fdrMax !== undefined || (Array.isArray(f.databases) && typeof f.databases[0] === 'number'))

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

    return () => {
      const e = exp.value
      if (!e) return <p>Loading…</p>
      const run = e.run
      const inProgress = isInProgress(run?.status)
      return (
        <div class="experiment-results-page" data-test-key="experiment-results-page">
          <header class="flex justify-between items-center mb-6">
            <div>
              <h2 class="text-2xl font-semibold">{e.name}</h2>
              <p class="text-sm text-gray-500">Status: {run?.status ?? 'NOT RUN'}</p>
            </div>
            <ElButton onClick={() => router.push(`/project/${projectId}/experiment/${id}/edit`)}>
              Edit experiment
            </ElButton>
          </header>
          {run?.error && <ElAlert type="error" title="Run failed" description={run.error} />}
          {inProgress && (
            <ElAlert type="info" title={`Run is ${run!.status}…`} description="This page will update automatically." />
          )}
          <ElSteps active={stage.value} simple class="mb-6" data-test-key="experiment-stepper">
            <ElStep title="Stage 1: Sample QC" />
            <ElStep title="Stage 2: Explore" />
            <ElStep title="Stage 3: Results" />
          </ElSteps>
          {stage.value === 0 && run && (
            <SampleQcStage experimentId={e.id} initialExcluded={run.excludedSamples ?? []} />
          )}
          {stage.value === 1 && run && (
            <ExploreStage
              experimentId={e.id}
              initialFilters={run.filters ?? null}
              {...{ 'onUpdate:filters': (f: any) => (currentFilters.value = f) }}
            />
          )}
          {stage.value === 2 && run && (
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
            <ElButton
              disabled={stage.value === 0}
              onClick={() => (stage.value = (stage.value - 1) as 0 | 1 | 2)}
              data-test-key="stage-back"
            >
              Back
            </ElButton>
            <ElButton
              type="primary"
              disabled={stage.value === 2}
              onClick={() => (stage.value = (stage.value + 1) as 0 | 1 | 2)}
              data-test-key="stage-next"
            >
              Next stage
            </ElButton>
          </div>
        </div>
      )
    }
  },
})
