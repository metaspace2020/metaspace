import { defineComponent, computed, inject } from 'vue'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { useRouter } from 'vue-router'
import { ElButton, ElCard, ElLink, ElMessage, ElMessageBox, ElTag } from '../../lib/element-plus'
import { experimentsByProjectQuery, deleteExperimentMutation } from './api'

interface ExperimentRunSummary {
  id: string
  status: string
  stage: string | null
}

interface ExperimentSummary {
  id: string
  name: string
  description: string | null
  createdAt: string
  createdBy: { id: string; name: string } | null
  datasets: { id: string; dataset: { id: string; name: string } | null }[]
  run: ExperimentRunSummary | null
}

const statusTagType = (s: string | null | undefined): 'success' | 'warning' | 'danger' | 'info' => {
  if (s === 'FINISHED') return 'success'
  if (s === 'RUNNING' || s === 'PREPARING' || s === 'QUEUED') return 'warning'
  if (s === 'FAILED') return 'danger'
  return 'info'
}

/**
 * Build a 1-line teaser from a list of dataset names: shows up to 3, with
 * an "… (+N more)" suffix when there are extras.
 */
const datasetTeaser = (datasets: { dataset: { name: string } | null }[]): string => {
  if (datasets.length === 0) return 'No datasets'
  const names = datasets.map((d) => d.dataset?.name).filter((n): n is string => !!n)
  const head = names.slice(0, 3).join(', ')
  const extra = names.length - 3
  return extra > 0 ? `${head} … (+${extra} more)` : head
}

export default defineComponent({
  name: 'ExperimentsList',
  props: {
    projectId: { type: String, required: true },
    canEdit: { type: Boolean, default: false },
  },
  setup(props) {
    const router = useRouter()
    const { result, loading, refetch } = useQuery<{ experimentsByProject: ExperimentSummary[] }>(
      experimentsByProjectQuery,
      () => ({ projectId: props.projectId })
    )
    const experiments = computed<ExperimentSummary[]>(() => result.value?.experimentsByProject ?? [])
    const apolloClient: any = inject(DefaultApolloClient)
    const deleteExperiment = (variables: any): Promise<any> =>
      apolloClient.mutate({ mutation: deleteExperimentMutation, variables })

    const onDelete = async (id: string): Promise<void> => {
      try {
        await ElMessageBox.confirm('Delete this experiment? This cannot be undone.', 'Confirm', {
          type: 'warning',
        })
      } catch (cancel) {
        return
      }
      try {
        await deleteExperiment({ id })
        await refetch()
        ElMessage.success('Experiment deleted')
      } catch (e) {
        ElMessage.error('Delete failed')
      }
    }

    return () => (
      <div class="space-y-4">
        {props.canEdit && (
          <div class="flex justify-end">
            <ElButton
              type="primary"
              data-test-key="create-experiment"
              onClick={() => router.push(`/project/${props.projectId}/experiment/new`)}
            >
              Create experiment
            </ElButton>
          </div>
        )}
        {loading.value && <p>Loading…</p>}
        {!loading.value && experiments.value.length === 0 && <p class="text-gray-500">No experiments yet.</p>}
        {experiments.value.map((exp) => (
          <ElCard key={exp.id} class="experiment-card">
            <div class="flex justify-between items-start">
              <div class="min-w-0 flex-1 pr-4">
                <div class="flex items-center gap-2">
                  <h3 class="text-lg font-semibold truncate">{exp.name}</h3>
                  <ElTag type={statusTagType(exp.run?.status)} size="small" data-test-key={`status-${exp.id}`}>
                    {exp.run?.status ?? 'NOT RUN'}
                  </ElTag>
                </div>
                <p class="text-sm text-gray-500 truncate" data-test-key={`datasets-${exp.id}`}>
                  {datasetTeaser(exp.datasets)}
                </p>
                <p class="text-xs text-gray-400">
                  Created by <strong>{exp.createdBy?.name ?? 'unknown'}</strong>
                </p>
              </div>
              <div class="flex gap-3 items-center">
                <ElButton
                  type="primary"
                  size="small"
                  data-test-key={`browse-${exp.id}`}
                  onClick={() => router.push(`/project/${props.projectId}/experiment/${exp.id}`)}
                >
                  Browse analysis
                </ElButton>
                {props.canEdit && (
                  <>
                    <ElLink
                      type="primary"
                      onClick={() => router.push(`/project/${props.projectId}/experiment/${exp.id}/edit`)}
                    >
                      Manage
                    </ElLink>
                    <ElLink type="danger" onClick={() => onDelete(exp.id)} data-test-key={`delete-${exp.id}`}>
                      Delete
                    </ElLink>
                  </>
                )}
              </div>
            </div>
          </ElCard>
        ))}
      </div>
    )
  },
})
