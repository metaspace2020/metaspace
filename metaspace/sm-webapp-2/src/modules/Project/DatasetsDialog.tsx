import {defineComponent, computed, reactive, ref, toRefs, onMounted, watch, inject} from 'vue';
import { ElDialog, ElButton, ElSelect, ElOption, ElInput, ElTable, ElTableColumn, ElPagination } from 'element-plus';
import {DefaultApolloClient, useQuery} from '@vue/apollo-composable';
import { isEqual } from 'lodash-es';
import moment from 'moment';
import { importDatasetsIntoProjectMutation, ProjectsListProject } from '../../api/project';
import { countDatasetsByStatusQuery, DatasetDetailItem, DatasetListItem, datasetListItemsQuery } from '../../api/dataset';
import reportError from '../../lib/reportError';
import './DatasetsDialog.scss';

interface DatasetsDialogState {
  selectedDatasets: any
  isSubmitting: boolean
  hasChanged: boolean
  handleSelectionDisabled: boolean
  updateValueDisabled: boolean
  datasetOwnerFilter: string
  nameFilter: string | undefined
  pageSize: number
  offset: number
  removedDatasets: string[]
}

interface DatasetsDialogProps {
  project: ProjectsListProject
  currentUser: any
  visible: boolean
  isManager: boolean
  refreshData: () => Promise<any>
}
export default defineComponent({
  name: 'DatasetsDialog',
  props: {
    project: { type: Object, default: undefined },
    currentUser: { type: Object, default: undefined },
    visible: { type: Boolean, default: true },
    isManager: { type: Boolean, default: false },
    refreshData: { type: Function, required: true },
  },
  setup(props: DatasetsDialogProps | any, { emit }) {
    const apolloClient = inject(DefaultApolloClient);
    const pageSizes = [2, 5, 15, 20, 25, 30]
    const table = ref(null)

    const state = reactive<DatasetsDialogState>({
      selectedDatasets: [] as any[],
      removedDatasets: [] as string[],
      isSubmitting: false,
      handleSelectionDisabled: true,
      updateValueDisabled: false,
      hasChanged: false,
      datasetOwnerFilter: 'project-datasets',
      nameFilter: '',
      pageSize: 5000,
      offset: 1,
    });

    const queryVars = computed(() => ({
      dFilter: {
        group: state.datasetOwnerFilter !== 'all-datasets'
        && state.datasetOwnerFilter !== 'my-datasets' && state.datasetOwnerFilter !== 'project-datasets'
          ? state.datasetOwnerFilter : undefined,
        submitter: state.datasetOwnerFilter === 'my-datasets' ? props.currentUser.id : undefined,
        project: state.datasetOwnerFilter === 'project-datasets' ? props.project.id : undefined,
        metadataType: 'Imaging MS',
        name: state.nameFilter,
      },
      limit: state.pageSize,
      offset: (state.offset - 1) * state.pageSize,
    }))

    const {
      result: datasetResult,
      refetch: datasetsRefetch,
    } = useQuery<{allDatasets: DatasetDetailItem}>(datasetListItemsQuery, queryVars)
    const datasets = computed(() => datasetResult.value != null ? datasetResult.value.allDatasets : null)

    const {
      result: projectDatasetsResult,
      refetch: projectDatasetsRefetch,
      onResult: onProjectDatasetsResult,
    } = useQuery<{allDatasets: DatasetListItem[]}>(datasetListItemsQuery,
      () => ({ dFilter: { project: props.project?.id } }))
    const projectDatasets = computed(() => projectDatasetsResult.value != null
      ? projectDatasetsResult.value.allDatasets : null)

    const setDefaultSelectedDatasets = (defaultPageSize : number = 5) => {
      state.selectedDatasets.forEach((dataset: any) => {
        if (Array.isArray(datasets.value) && datasets.value.find((row: any) => row?.id === dataset?.id)) {
          // @ts-ignore
          table.value!.toggleRowSelection(datasets.value.find((row: any) => row?.id === dataset?.id), true)
        }
      })

      state.handleSelectionDisabled = false
      state.pageSize = defaultPageSize
    }

    onProjectDatasetsResult(async(result) => {
      state.selectedDatasets = projectDatasets.value
    })

    const onDialogOpen = () => {
      state.handleSelectionDisabled = true
      setDefaultSelectedDatasets()
    }

    const onDialogClose = async() => {
      state.datasetOwnerFilter = 'project-datasets'
      await projectDatasetsRefetch()
      await datasetsRefetch()
    }

    const {
      result: datasetCountResult,
      loading: datasetCountLoading,
      refetch: datasetsCountRefetch,
    } = useQuery<{countDatasetsPerGroup: any}>(countDatasetsByStatusQuery, queryVars)
    const datasetCount = computed(() => datasetCountResult.value != null
      ? datasetCountResult.value.countDatasetsPerGroup?.counts[0]?.count : 0)
    const handleClose = () => {
      emit('close')
    }

    const handleGroupSelect = (value: string) => {
      state.datasetOwnerFilter = value
    }

    const handleQueryChange = (value: string) => {
      state.nameFilter = value
    }

    const handleSelectionChange = (value: any) => {
      state.selectedDatasets = value

      if (isEqual(state.selectedDatasets, projectDatasets.value)) {
        state.hasChanged = false
      } else {
        state.hasChanged = true
      }
    }

    const handlePageChange = (value: number) => {
      state.offset = value
    }

    const handlePageSizeChange = (value: number) => {
      state.pageSize = value
    }

    const handleUpdate = async() => {
      const selectedDatasetIds = state.selectedDatasets.map((ds: any) => ds.id)
      const defaultDatasetIds = projectDatasets.value!.map((ds: any) => ds.id)
      const removedDatasetIds = defaultDatasetIds.filter((dsId: string) => !selectedDatasetIds.includes(dsId))
      const addedDatasetIds = selectedDatasetIds.filter((dsId: string) => !defaultDatasetIds.includes(dsId))
      try {
        state.isSubmitting = true
        if (addedDatasetIds.length > 0 || removedDatasetIds.length > 0) {
          await apolloClient.mutate({
            mutation: importDatasetsIntoProjectMutation,
            variables: { projectId: props.project?.id, datasetIds: addedDatasetIds, removedDatasetIds },
          })
        }
        await props.refreshData()

        // TODO: improve way to solve this workaround
        // rendering all projects to render all project rows and select it
        const oldPageSize = state.pageSize
        state.datasetOwnerFilter = 'project-datasets'
        state.pageSize = 5000
        await projectDatasetsRefetch()
        await datasetsRefetch()
        await datasetsCountRefetch()
        setDefaultSelectedDatasets(oldPageSize)
        emit('update')
      } catch (err) {
        reportError(err)
      } finally {
        state.isSubmitting = false
      }
    }

    const paginationLayout = () => {
      const limitedSpace = datasets.value && (datasets.value as any).length === 1
      if (limitedSpace) {
        return 'pager'
      }

      return 'prev,pager,next,sizes'
    }

    const dateFormatter = (row: any, column: any, cellValue: any, index: number) => {
      return moment(cellValue).format('D MMMM, YYYY')
    }

    return () => {
      const {
        visible, currentUser,
      } = props
      const selectedDatasetIds = (state.selectedDatasets || []).map((ds: any) => ds.id)
      const defaultDatasetIds = (projectDatasets.value || []).map((ds: any) => ds.id)
      const removedDatasetIds = defaultDatasetIds.filter((dsId: string) => !selectedDatasetIds.includes(dsId))
      const addedDatasetIds = selectedDatasetIds.filter((dsId: string) => !defaultDatasetIds.includes(dsId))

      return (
        <ElDialog
          class='project-datasets-dialog'
          modelValue={visible}
          append-to-body
          title={'Add or remove datasets in this project'}
          lockScroll={false}
          onOpened={onDialogOpen}
          onClosed={onDialogClose}
          onClose={handleClose}>
          <div class="mt-6">
            <div class='filter-box'>
              <ElSelect
                class='select-box-mini'
                modelValue={state.datasetOwnerFilter}
                onChange={handleGroupSelect}
                placeholder='5%'
                size='small'>
                <ElOption label="All datasets" value={'all-datasets'}/>
                <ElOption label="My datasets" value={'my-datasets'}/>
                <ElOption label="Project datasets" value={'project-datasets'}/>
                {
                  currentUser
                  && Array.isArray(currentUser.groups)
                  && currentUser.groups.map((item: any) => <ElOption label={item.group.label} value={item.group.id}/>)
                }
              </ElSelect>
              <ElInput
                class='query-filter'
                modelValue={state.nameFilter}
                onInput={handleQueryChange}
                size='small'
                placeholder='Enter dataset name'
              />
            </div>
            <div class='table-box mt-2'>
              <ElTable
                ref={table}
                onSelection-change={state.handleSelectionDisabled ? () => {
                } : handleSelectionChange}
                data={(datasets.value || []) as any}
                size="small"
                element-loading-text="Loading results …"
                width="100%"
                stripe
                rowKey="id">

                <ElTableColumn
                  type="selection"
                  reserveSelection
                />
                <ElTableColumn
                  key="name"
                  property="name"
                  label="Dataset"
                  minWidth="100"
                />
                <ElTableColumn
                  key="submitter.name"
                  property="submitter.name"
                  label="Submitter"
                />
                <ElTableColumn
                  key="uploadDT"
                  property="uploadDT"
                  label="Upload date"
                  formatter={dateFormatter}
                />
              </ElTable>
            </div>

            {
              datasetCount.value > 0
              &&
              <ElPagination
                class='mt-2'
                total={datasetCount.value}
                pageSizes={pageSizes}
                pageSize={state.pageSize} // @ts-ignore
                onUpdate:pageSize={handlePageSizeChange}
                currentPage={state.offset} // @ts-ignore
                onUpdate:currentPage={handlePageChange}
                layout={paginationLayout()} />
            }
            <div class="ds-dialog-bt-bar button-bar">
              <div class='flex-col' style={{visibility: state.hasChanged ? 'visible' : 'hidden'}}>
                <div style={{color: 'green'}}>
                  {addedDatasetIds.length > 0 ? `${addedDatasetIds.length} dataset to be added` : ''}
                </div>
                <div style={{color: 'red'}}>
                  {removedDatasetIds.length > 0 ? `${removedDatasetIds.length} dataset to be removed` : ''}
                </div>
              </div>
              <div>
                <ElButton onClick={handleClose}>
                  Cancel
                </ElButton>
                <ElButton
                  class='w-32'
                  loading={state.isSubmitting}
                  disabled={!state.hasChanged}
                  type="primary"
                  onClick={handleUpdate}>
                  Update
                </ElButton>
              </div>
            </div>
          </div>
        </ElDialog>
      )
    }
  },
});
