import { defineComponent, computed, reactive, inject, watch } from 'vue'
import { importDatasetsIntoProjectMutation, ProjectsListProject } from '../../api/project'
import { ElDialog, ElCheckbox, ElButton } from '../../lib/element-plus'
import { uniqBy, isEmpty } from 'lodash'
import './ProjectDatasetsDialog.scss'
import { DatasetListItem, datasetListItemsQuery } from '../../api/dataset'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import ElapsedTime from '../../components/ElapsedTime'
import reportError from '../../lib/reportError'

interface CheckOptions {
  [key: string]: boolean
}

interface ProjectDatasetsDialogState {
  selectedDatasets: CheckOptions
  isSubmitting: boolean
  hasChanged: boolean
}

interface ProjectDatasetsDialogProps {
  project: ProjectsListProject
  currentUserId: string
  visible: boolean
  isManager: boolean
  refreshData: () => Promise<any>
}

export const ProjectDatasetsDialog = defineComponent({
  name: 'ProjectDatasetsDialog',
  props: {
    project: { type: Object, default: undefined },
    currentUserId: { type: String, default: undefined },
    visible: { type: Boolean, default: true },
    isManager: { type: Boolean, default: false },
    refreshData: { type: Function, required: true },
  },
  setup(props: ProjectDatasetsDialogProps | any, ctx) {
    const { emit } = ctx
    const apolloClient = inject(DefaultApolloClient)
    const state = reactive<ProjectDatasetsDialogState>({
      selectedDatasets: {},
      isSubmitting: false,
      hasChanged: false,
    })

    const getProjectDatasets = (projectDatasets: any) => {
      const defaultDatasets = {} as CheckOptions

      if (projectDatasets) {
        projectDatasets.forEach((ds: any) => {
          defaultDatasets[ds.id] = true
        })
      }
      return defaultDatasets
    }

    const getAvailableDatasets = (datasets: any, projectDatasets: any) => {
      if (!props.isManager) {
        return datasets
      }

      if (datasets && projectDatasets) {
        // show not owned datasets if admin, so it can be removed
        return uniqBy(datasets.concat(projectDatasets), 'id')
      }

      return []
    }

    const { result: datasetsResult } = useQuery<{ allDatasets: DatasetListItem[] }>(datasetListItemsQuery, () => ({
      dFilter: { submitter: props.currentUserId },
    }))
    const datasets = computed(() =>
      datasetsResult.value != null ? (datasetsResult.value.allDatasets as DatasetListItem[]) : null
    )
    const { result: projectDatasetsResult, refetch: projectDatasetsRefetch } = useQuery<{
      allDatasets: DatasetListItem[]
    }>(datasetListItemsQuery, () => ({ dFilter: { project: props.project?.id } }))
    const projectDatasets = computed(() => {
      return projectDatasetsResult.value != null ? (projectDatasetsResult.value.allDatasets as DatasetListItem[]) : null
    })

    watch(projectDatasetsResult, (newValue) => {
      if (isEmpty(state.selectedDatasets)) {
        state.selectedDatasets = getProjectDatasets(newValue?.allDatasets)
      }
    })

    const handleClose = () => {
      emit('close')
    }

    const handleDatasetCheck = (value: boolean, key: string) => {
      state.selectedDatasets[key] = value
      if (!state.hasChanged) {
        state.hasChanged = true
      }
    }

    const handleSelectNone = () => {
      const availableDatasets = getAvailableDatasets(datasets?.value, projectDatasets?.value).map((ds: any) => ds.id)
      availableDatasets.forEach((key: string) => {
        state.selectedDatasets[key] = false
      })
      if (!state.hasChanged) {
        state.hasChanged = true
      }
    }

    const handleSelectAll = () => {
      const availableDatasets = getAvailableDatasets(datasets?.value, projectDatasets?.value).map((ds: any) => ds.id)
      availableDatasets.forEach((key: string) => {
        state.selectedDatasets[key] = true
      })
      if (!state.hasChanged) {
        state.hasChanged = true
      }
    }

    const handleProjectDatasetsUpdate = async () => {
      const previousDatasets = getProjectDatasets(projectDatasets?.value)
      const removedDatasetIds: string[] = []
      const addedDatasetIds: string[] = []
      state.isSubmitting = true
      Object.keys(state.selectedDatasets).forEach((key: string) => {
        if (previousDatasets[key] && !state.selectedDatasets[key]) {
          // remove ds
          removedDatasetIds.push(key)
        } else if (!previousDatasets[key] && state.selectedDatasets[key]) {
          // new ds * do not add already
          addedDatasetIds.push(key)
        }
      })

      try {
        if (addedDatasetIds.length > 0 || removedDatasetIds.length > 0) {
          await apolloClient.mutate({
            mutation: importDatasetsIntoProjectMutation,
            variables: { projectId: props.project?.id, datasetIds: addedDatasetIds, removedDatasetIds },
          })
        }
        await props.refreshData()
        await projectDatasetsRefetch()
        emit('update')
      } catch (err) {
        reportError(err)
      } finally {
        state.isSubmitting = false
      }
    }

    return () => {
      const { visible, project } = props
      const { name } = project
      const availableDatasets = getAvailableDatasets(datasets?.value, projectDatasets?.value)

      return (
        <ElDialog
          class="project-datasets-dialog"
          modelValue={visible}
          append-to-body
          title={`Manage ${name}\`s datasets`}
          lockScroll={false}
          onClose={handleClose}
        >
          <div class="mt-6">
            <h4 class="m-0">Would you like to include/remove previously submitted datasets?</h4>
            {availableDatasets != null && availableDatasets.length > 0 && (
              <div class="dataset-checkbox-list leading-6">
                <div class="mb-2">
                  <span class="select-link" onClick={handleSelectNone}>
                    Select none
                  </span>
                  <span> | </span>
                  <span class="select-link" onClick={handleSelectAll}>
                    Select all
                  </span>
                </div>
                {availableDatasets.map((dataset: any) => (
                  <ElCheckbox
                    class="flex h-6 items-center m-0 mx-2"
                    key={dataset.id}
                    modelValue={state.selectedDatasets[dataset.id] as any}
                    disabled={state.isSubmitting}
                    onChange={(value: any) => handleDatasetCheck(value, dataset.id)}
                    label={dataset.name}
                  >
                    <span class="truncate">{dataset?.name}</span>
                    <span class="text-gray-700 text-xs tracking-wide pl-1">
                      <ElapsedTime date={dataset?.uploadDT} />
                    </span>
                  </ElCheckbox>
                ))}
              </div>
            )}
            {availableDatasets !== null && availableDatasets.length === 0 && (
              <div class="flex items-center justify-center leading-6">
                <div>No datasets available</div>
              </div>
            )}

            <div class="button-bar">
              <ElButton onClick={handleClose}>Cancel</ElButton>
              <ElButton
                class="w-32"
                loading={state.isSubmitting}
                disabled={!state.hasChanged}
                type="primary"
                onClick={handleProjectDatasetsUpdate}
              >
                Update
              </ElButton>
            </div>
          </div>
        </ElDialog>
      )
    }
  },
})
