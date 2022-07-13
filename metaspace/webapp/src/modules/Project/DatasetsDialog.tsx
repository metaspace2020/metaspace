import { defineComponent, computed, reactive, ref } from '@vue/composition-api'
import { importDatasetsIntoProjectMutation, ProjectsListProject } from '../../api/project'
import { Dialog, Checkbox, Button, Select, Option, Input, Table, TableColumn, Pagination } from '../../lib/element-ui'
import { uniqBy, isEmpty } from 'lodash'
import './DatasetsDialog.scss'
import { countDatasetsByStatusQuery, DatasetDetailItem, DatasetListItem, datasetListItemsQuery } from '../../api/dataset'
import { useQuery } from '@vue/apollo-composable'
import reportError from '../../lib/reportError'
import Vue from 'vue'
import { calculateMzFromFormula, isFormulaValid } from '../../lib/formulaParser'
import { annotationListQuery } from '../../api/annotation'
import config from '../../lib/config'

interface CheckOptions {
  [key: string]: boolean
}

interface DatasetsDialogState {
  selectedDatasets: CheckOptions
  isSubmitting: boolean
  hasChanged: boolean
  datasetOwnerFilter: string
  nameFilter: string | undefined
  pageSize: number
  offset: number
}

interface DatasetsDialogProps {
  project: ProjectsListProject
  currentUser: any
  visible: boolean
  isManager: boolean
  refreshData: () => Promise<any>
}

export const DatasetsDialog = defineComponent<DatasetsDialogProps>({
  name: 'DatasetsDialog',
  props: {
    project: { type: Object, default: undefined },
    currentUser: { type: Object, default: undefined },
    visible: { type: Boolean, default: true },
    isManager: { type: Boolean, default: false },
    refreshData: { type: Function, required: true },
  },
  setup(props, ctx) {
    const { emit } = ctx
    const pageSizes = [5, 15, 20, 25, 30]
    const table = ref(null)

    const state = reactive<DatasetsDialogState>({
      selectedDatasets: {},
      isSubmitting: false,
      hasChanged: false,
      datasetOwnerFilter: 'all-datasets',
      nameFilter: undefined,
      pageSize: 5,
      offset: 1,
    })

    const queryVars = computed(() => ({
      dFilter: {
        group: state.datasetOwnerFilter !== 'all-datasets'
        && state.datasetOwnerFilter !== 'my-datasets' && state.datasetOwnerFilter !== 'project-datasets'
          ? state.datasetOwnerFilter : undefined,
        submitter: state.datasetOwnerFilter === 'my-datasets' ? props.currentUser.id : undefined,
        project: state.datasetOwnerFilter === 'project-datasets' ? props.project.id : undefined,
        metadataType: 'Imaging MS',
        status: 'FINISHED',
        name: state.nameFilter,
      },
      limit: state.pageSize,
      offset: (state.offset - 1) * state.pageSize,
    }))

    const {
      result: datasetResult,
      loading: datasetLoading,
    } = useQuery<{allDatasets: DatasetDetailItem}>(datasetListItemsQuery, queryVars)
    const datasets = computed(() => datasetResult.value != null ? datasetResult.value.allDatasets : null)

    const {
      result: datasetCountResult,
      loading: datasetCountLoading,
    } = useQuery<{countDatasetsPerGroup: any}>(countDatasetsByStatusQuery, queryVars)
    const datasetCount = computed(() => datasetCountResult.value != null
      ? datasetCountResult.value.countDatasetsPerGroup.counts[0].count : null)

    const handleClose = () => {
      emit('close')
    }

    const handleGroupSelect = (value: string) => {
      state.datasetOwnerFilter = value
    }

    const handleQueryChange = (value: string) => {
      console.log('dude', value)
      state.nameFilter = value
    }

    const handleSelectionChange = (value: any) => {
      console.log('selected', value)
      state.selectedDatasets = value
    }

    const handlePageChange = (value: number) => {
      console.log('page change', value)
      state.offset = value
    }

    const handlePageSizeChange = (value: number) => {
      console.log('value', value)
      state.pageSize = value
    }

    const paginationLayout = () => {
      const limitedSpace = datasets.value && (datasets.value as any).length === 1
      if (limitedSpace) {
        return 'pager'
      }

      return 'prev,pager,next,sizes'
    }

    return () => {
      const {
        visible, currentUser,
      } = props

      console.log('quer', queryVars)

      return (
        <Dialog
          customClass='project-datasets-dialog'
          visible={visible}
          append-to-body
          title={'Add or remove datasets in this project'}
          lockScroll={false}
          onClose={handleClose}>
          <div class="mt-6">
            <div class='filter-box'>
              <Select
                class='select-box-mini'
                value={state.datasetOwnerFilter}
                onChange={handleGroupSelect}
                placeholder='5%'
                size='mini'>
                <Option label="All datasets" value={'all-datasets'}/>
                <Option label="My datasets" value={'my-datasets'}/>
                <Option label="Project datasets" value={'project-datasets'}/>
                {
                  currentUser
                && Array.isArray(currentUser.groups)
                && currentUser.groups.map((item: any) => <Option label={item.group.label} value={item.group.id}/>)
                }
              </Select>
              <Input
                class='query-filter'
                value={state.nameFilter}
                onInput={handleQueryChange}
                size='mini'
                placeholder='Enter dataset name'
              />
            </div>
            <div class='table-box'>
              <Table
                id="annot-table"
                ref={table}
                data={datasets.value || []}
                size="mini"
                current
                elementLoadingText="Loading results …"
                highlightCurrentRow
                width="100%"
                stripe
                {...{
                  on: {
                    'selection-change': handleSelectionChange,
                  },
                }}
                tabindex="1">

                <TableColumn
                  type="selection"
                />
                <TableColumn
                  key="name"
                  property="name"
                  label="Dataset"
                />
                <TableColumn
                  key="submitter.name"
                  property="submitter.name"
                  label="Submitter"
                />
                <TableColumn
                  key="uploadDT"
                  property="uploadDT"
                  label="Upload date"
                />
              </Table>
            </div>
            <Pagination
              total={datasetCount.value}
              pageSize={state.pageSize}
              pageSizes={pageSizes}
              currentPage={state.offset}
              {...{ on: { 'update:currentPage': handlePageChange } }}
              {...{ on: { 'update:pageSize': handlePageSizeChange } }}
              layout={paginationLayout()}
            />
            <div class="button-bar">
              <Button onClick={handleClose}>
                Cancel
              </Button>
              <Button
                class='w-32'
                loading={state.isSubmitting}
                disabled={!state.hasChanged}
                type="primary"
                onClick={() => {}}>
                Update
              </Button>
            </div>
          </div>
        </Dialog>
      )
    }
  },
})
