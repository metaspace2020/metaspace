import { defineComponent, computed, reactive } from '@vue/composition-api'
import { importDatasetsIntoProjectMutation, ProjectsListProject } from '../../api/project'
import { Dialog, Checkbox, Button } from '../../lib/element-ui'
import { uniqBy } from 'lodash'
import './ProjectDatasetsDialog.scss'
import { DatasetListItem, datasetListItemsQuery } from '../../api/dataset'
import { useQuery } from '@vue/apollo-composable'
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
  isAdmin: boolean
  projectDatasets: string[]
  dialogLabel: string
  saveBtnLabel: string
  cancelBtnLabel: string
  selectAllLabel: string
  selectNoneLabel: string
  noDatasetsLabel: string
  refreshData: () => Promise<any>
}

export const ProjectDatasetsDialog = defineComponent<ProjectDatasetsDialogProps>({
  name: 'ProjectDatasetsDialog',
  props: {
    project: { type: Object, default: undefined },
    currentUserId: { type: String, default: undefined },
    dialogLabel: { type: String, default: 'Would you like to include/remove previously submitted datasets?' },
    saveBtnLabel: { type: String, default: 'Update' },
    cancelBtnLabel: { type: String, default: 'Cancel' },
    selectAllLabel: { type: String, default: 'Select all' },
    selectNoneLabel: { type: String, default: 'Select none' },
    noDatasetsLabel: { type: String, default: 'No datasets available' },
    visible: { type: Boolean, default: true },
    isAdmin: { type: Boolean, default: false },
    projectDatasets: { type: Array, default: () => [] },
    refreshData: { type: Function, required: true },
  },
  setup(props, ctx) {
    const { emit, root } = ctx
    const { $apollo } = root
    const getProjectDatasets = () => {
      const defaultDatasets = {} as CheckOptions
      if (Array.isArray(props.projectDatasets)) {
        props.projectDatasets.forEach((ds: any) => {
          defaultDatasets[ds.id] = true
        })
      }
      return defaultDatasets
    }
    const state = reactive<ProjectDatasetsDialogState>({
      selectedDatasets: getProjectDatasets(),
      isSubmitting: false,
      hasChanged: false,
    })
    const {
      result: datasetsResult,
      loading,
    } = useQuery<{allDatasets: DatasetListItem[]}>(datasetListItemsQuery, {
      dFilter: {
        submitter: props.currentUserId,
      },
    })
    const datasets = computed(() => datasetsResult.value != null
      ? datasetsResult.value.allDatasets as DatasetListItem[] : null)

    const getAvailableDatasets = (datasets: any) => {
      if (!props.isAdmin) {
        return datasets
      }

      if (Array.isArray(datasets) && Array.isArray(props.projectDatasets)) {
        // show not owned datasets if admin, so it can be removed
        return uniqBy(datasets.concat(props.projectDatasets), 'id')
      }

      return []
    }

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
      const availableDatasets = getAvailableDatasets(datasets?.value).map((ds: any) => ds.id)
      availableDatasets.forEach((key: string) => { state.selectedDatasets[key] = false })
      if (!state.hasChanged) {
        state.hasChanged = true
      }
    }

    const handleSelectAll = () => {
      const availableDatasets = getAvailableDatasets(datasets?.value).map((ds: any) => ds.id)
      availableDatasets.forEach((key: string) => { state.selectedDatasets[key] = true })
      if (!state.hasChanged) {
        state.hasChanged = true
      }
    }

    const handleProjectDatasetsUpdate = async() => {
      const previousDatasets = getProjectDatasets()
      const removedDatasetIds: string[] = []
      const addedDatasetIds: string[] = []
      state.isSubmitting = true
      Object.keys(state.selectedDatasets).forEach((key: string) => {
        if (previousDatasets[key] && !state.selectedDatasets[key]) { // remove ds
          removedDatasetIds.push(key)
        } else if (!previousDatasets[key] && state.selectedDatasets[key]) { // new ds * do not add already
          addedDatasetIds.push(key)
        }
      })

      try {
        if (addedDatasetIds.length > 0 || removedDatasetIds.length > 0) {
          await $apollo.mutate({
            mutation: importDatasetsIntoProjectMutation,
            variables: { projectId: props.project?.id, datasetIds: addedDatasetIds, removedDatasetIds },
          })
        }
        await props.refreshData()
        emit('update')
      } catch (err) {
        reportError(err)
      } finally {
        state.isSubmitting = false
      }
    }

    return () => {
      const {
        visible, project, dialogLabel, saveBtnLabel, cancelBtnLabel,
        selectAllLabel, selectNoneLabel, noDatasetsLabel,
      } = props
      const { name } = project
      const availableDatasets = getAvailableDatasets(datasets?.value)

      return (
        <Dialog
          class='project-datasets-dialog'
          visible={visible}
          append-to-body
          title={`Manage ${name}\`s datasets`}
          lockScroll={false}
          onClose={handleClose}>
          <div class="mt-6">
            <h4 class="m-0">
              {dialogLabel}
            </h4>
            {
              Array.isArray(availableDatasets) && availableDatasets.length > 0
                && <div class="dataset-checkbox-list leading-6">
                  <div class="mb-2">
                    <span
                      class="select-link"
                      onClick={handleSelectNone}>{selectNoneLabel}</span>
                    <span> | </span>
                    <span
                      class="select-link"
                      onClick={handleSelectAll}>{selectAllLabel}</span>
                  </div>
                  {
                    availableDatasets.map((dataset) => <Checkbox
                      class="flex h-6 items-center m-0 mx-2"
                      key={dataset.id}
                      value={state?.selectedDatasets[dataset.id]}
                      disabled={state?.isSubmitting}
                      onChange={(value: boolean) => handleDatasetCheck(value, dataset.id)}
                      label={dataset.name}>
                      <span class="truncate">
                        { dataset?.name }
                      </span>
                      <span class="text-gray-700 text-xs tracking-wide pl-1">
                        <ElapsedTime date={dataset?.uploadDT} />
                      </span>
                    </Checkbox>)
                  }
                </div>
            }
            {
              Array.isArray(availableDatasets) && availableDatasets.length === 0
                && <div class="flex items-center justify-center leading-6">
                  <div>{noDatasetsLabel}</div>
                </div>
            }

            <div class="button-bar">
              <Button onClick={handleClose}>
                {cancelBtnLabel}
              </Button>
              <Button
                class='w-32'
                loading={state?.isSubmitting}
                disabled={!state?.hasChanged}
                type="primary"
                onClick={handleProjectDatasetsUpdate}>
                {saveBtnLabel}
              </Button>
            </div>
          </div>
        </Dialog>
      )
    }
  },
})
