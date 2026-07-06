import { defineComponent, computed, inject, onMounted } from 'vue'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { useRouter } from 'vue-router'
import { ElButton, ElCard, ElIcon, ElMessage, ElMessageBox, ElTag } from '../../lib/element-plus'
import { PictureFilled, EditPen, Delete } from '@element-plus/icons-vue'
import { experimentsByProjectQuery, deleteExperimentMutation, experimentProjectRoleQuery } from './api'
import { useExperimentPermissions, promptExperimentProUpgrade } from './composables/experimentPermissions'
import { ProjectRoleOptions } from '../../api/project'
import CopyButton from '../../components/CopyButton.vue'
import ElapsedTime from '../../components/ElapsedTime'

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
    const { isAdmin, currentUserId, canCreateExperiment } = useExperimentPermissions()
    // Create is allowed for admins, or project editors with an active Pro subscription.
    // The button stays visible for any project editor; non-Pro users are prompted to
    // upgrade on click rather than having the button hidden.
    const canCreate = canCreateExperiment(() => props.canEdit)

    // Delete is more restricted than edit: only the experiment creator, a project
    // manager, or an admin may delete. Project managers are distinguished from plain
    // members via the project role.
    const { result: projectRoleResult } = useQuery<{ project: { currentUserRole: string | null } | null }>(
      experimentProjectRoleQuery,
      () => ({ projectId: props.projectId })
    )
    const isManager = computed(() => projectRoleResult.value?.project?.currentUserRole === ProjectRoleOptions.MANAGER)
    const canDeleteExperiment = (exp: ExperimentSummary): boolean =>
      isAdmin.value || isManager.value || (!!currentUserId.value && exp.createdBy?.id === currentUserId.value)

    const onCreate = (): void => {
      if (canCreate.value) {
        router.push(`/project/${props.projectId}/experiment/new`)
      } else {
        promptExperimentProUpgrade()
      }
    }
    const { result, loading, refetch } = useQuery<{ experimentsByProject: ExperimentSummary[] }>(
      experimentsByProjectQuery,
      () => ({ projectId: props.projectId }),
      { fetchPolicy: 'network-only' }
    )
    const experiments = computed<ExperimentSummary[]>(() => result.value?.experimentsByProject ?? [])
    onMounted(() => {
      refetch()
    })
    const apolloClient: any = inject(DefaultApolloClient)
    const deleteExperiment = (variables: any): Promise<any> =>
      apolloClient.mutate({ mutation: deleteExperimentMutation, variables })

    const onDelete = async (exp: ExperimentSummary): Promise<void> => {
      if (!canDeleteExperiment(exp)) {
        try {
          await ElMessageBox.alert(
            'You cannot delete this experiment. Only the experiment creator or a project manager can delete it.',
            'Cannot delete',
            { type: 'warning' }
          )
        } catch (dismissed) {
          // alert dismissed — nothing to do
        }
        return
      }
      try {
        await ElMessageBox.confirm('Delete this experiment? This cannot be undone.', 'Confirm', {
          type: 'warning',
        })
      } catch (cancel) {
        return
      }
      try {
        await deleteExperiment({ id: exp.id })
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
            <ElButton type="primary" data-test-key="create-experiment" onClick={onCreate}>
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
                  <h3 class="text-lg font-semibold truncate m-0">{exp.name}</h3>
                  <CopyButton isId text={exp.id}>
                    Copy experiment id to clipboard
                  </CopyButton>
                  <ElTag type={statusTagType(exp.run?.status)} size="small" data-test-key={`status-${exp.id}`}>
                    {exp.run?.status ?? 'NOT RUN'}
                  </ElTag>
                </div>
                <p class="text-sm text-gray-500 truncate" data-test-key={`datasets-${exp.id}`}>
                  {datasetTeaser(exp.datasets)}
                </p>
                <p class="text-xs text-gray-400">
                  Created by <strong>{exp.createdBy?.name ?? 'unknown'}</strong>
                  {' — '}
                  <ElapsedTime date={exp.createdAt} />
                </p>
              </div>
              <div class="flex flex-col gap-1 items-start">
                <div class="flex items-center">
                  <ElIcon>
                    <PictureFilled />
                  </ElIcon>
                  <a
                    href="#"
                    class="ml-1"
                    data-test-key={`browse-${exp.id}`}
                    onClick={(e) => {
                      e.preventDefault()
                      router.push(`/project/${props.projectId}/experiment/${exp.id}`)
                    }}
                  >
                    Browse analysis
                  </a>
                </div>
                {props.canEdit && (
                  <>
                    <div class="flex items-center">
                      <ElIcon>
                        <EditPen />
                      </ElIcon>
                      <a
                        href="#"
                        class="ml-1"
                        onClick={(e) => {
                          e.preventDefault()
                          router.push(`/project/${props.projectId}/experiment/${exp.id}/edit`)
                        }}
                      >
                        Manage experiment
                      </a>
                    </div>
                    <div class="flex items-center">
                      <ElIcon>
                        <Delete />
                      </ElIcon>
                      <a
                        href="#"
                        class="ml-1 text-danger"
                        data-test-key={`delete-${exp.id}`}
                        onClick={(e) => {
                          e.preventDefault()
                          onDelete(exp)
                        }}
                      >
                        Delete experiment
                      </a>
                    </div>
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
