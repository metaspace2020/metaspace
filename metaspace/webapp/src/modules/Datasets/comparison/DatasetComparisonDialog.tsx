import { computed, defineComponent, onMounted, reactive, watchEffect } from '@vue/composition-api'
import { Workflow, WorkflowStep } from '../../../components/Workflow'
import { Select, Option, InputNumber, Button, Dialog } from '../../../lib/element-ui'
import { ErrorLabelText } from '../../../components/Form'
import { useMutation, useQuery } from '@vue/apollo-composable'
import {
  DatasetDetailItem,
  datasetListItemsQuery,
} from '../../../api/dataset'
import './DatasetComparisonDialog.scss'
import gql from 'graphql-tag'
import { isEqual, uniqBy } from 'lodash-es'

const saveSettings = gql`mutation saveImageViewerSnapshotMutation($input: ImageViewerSnapshotInput!) {
  saveImageViewerSnapshot(input: $input)
}`
interface DatasetComparisonDialogProps {
  selectedDatasetIds: string[]
}

interface DatasetComparisonDialogState {
  selectedDatasetIds: string[]
  cachedOptions: any[]
  workflowStep: number
  nCols: number
  nRows: number
  showOptions: boolean
  firstStepError: boolean
  secondStepError: boolean
  finalStepError: boolean
  loading: boolean
  arrangement: {[key: string] : string}
  datasetName: string
}

export const DatasetComparisonDialog = defineComponent<DatasetComparisonDialogProps>({
  name: 'DatasetComparisonDialog',
  props: {
    selectedDatasetIds: {
      type: Array,
      default: () => [],
    },
  },
  setup(props, { emit, root }) {
    const state = reactive<DatasetComparisonDialogState>({
      selectedDatasetIds: props.selectedDatasetIds,
      workflowStep: 1,
      nCols: 2,
      nRows: 2,
      showOptions: true,
      firstStepError: false,
      secondStepError: false,
      finalStepError: false,
      arrangement: {},
      loading: false,
      cachedOptions: [],
      datasetName: '',
    })

    const queryVars = computed(() => ({
      dFilter: {
        ids: null,
        polarity: null,
        metadataType: 'Imaging MS',
        status: 'FINISHED',
        name: state.datasetName,
      },
      query: '',
      limit: 2,
    }))
    const {
      result: datasetResult,
      loading: datasetLoading,
    } = useQuery<{allDatasets: DatasetDetailItem}>(datasetListItemsQuery, queryVars)
    const {
      result: receivedDatasetsResult,
      loading: receivedDatasetsResultLoading,
    } = useQuery<{allDatasets: DatasetDetailItem}>(gql`query DatasetNames($ids: String) {
      allDatasets(filter: {ids: $ids}) {
        id
        name
        uploadDT
      }
    }`, { ids: props.selectedDatasetIds.join('|') })
    const dataset = computed(() => datasetResult.value != null ? datasetResult.value.allDatasets : null)
    const receivedDatasets = computed(() => receivedDatasetsResult.value != null
      ? receivedDatasetsResult.value.allDatasets : null)
    const { mutate: settingsMutation } = useMutation<any>(saveSettings)

    const annotationsLink = async() => {
      const variables : any = {
        input: {
          version: 1,
          annotationIds: state.selectedDatasetIds,
          snapshot: JSON.stringify({
            nCols: state.nCols,
            nRows: state.nRows,
            grid: state.arrangement,
          }),
          datasetId: props.selectedDatasetIds[0] || state.selectedDatasetIds[0],
        },
      }
      const result = await settingsMutation(variables)
      return {
        name: 'datasets-comparison',
        params: {
          dataset_id: props.selectedDatasetIds[0] || state.selectedDatasetIds[0],
          snapshot_id: result.data.saveImageViewerSnapshot,
        },
      }
    }

    watchEffect(() => {
      if (dataset.value && !isEqual(state.cachedOptions,
        uniqBy(state.cachedOptions.concat(dataset.value), 'id'))) {
        state.cachedOptions = uniqBy(state.cachedOptions.concat(dataset.value), 'id')
      }
      if (receivedDatasets.value && !isEqual(state.cachedOptions,
        uniqBy(state.cachedOptions.concat(receivedDatasets.value), 'id'))) {
        state.cachedOptions = uniqBy(state.cachedOptions.concat(receivedDatasets.value), 'id')
      }
    })

    const options = computed(() => state.selectedDatasetIds.map((id: string) => {
      return state.cachedOptions.find((opt: any) => opt.id === id)
    }).filter((id: string) => id !== undefined))

    const fetchDatasets = async(query: string) => {
      state.datasetName = query
    }

    const handleDatasetSelection = (options: string[]) => {
      state.selectedDatasetIds = options
    }

    const handleSelection = (value: string, row: number, col: number) => {
      state.showOptions = false
      state.arrangement[`${row}-${col}`] = value
      setTimeout(() => {
        state.showOptions = true
      }, 0)
    }

    return () => {
      const datasets : any[] = uniqBy(((options.value || []) as any[]).concat((dataset.value || []) as any[])
        , 'id')

      return (
        <Dialog
          visible
          lockScroll={true}
          onclose={() => emit('close')}
          class="dataset-comparison-dialog sm-content-page el-dialog-lean">
          <h1>Datasets Comparison</h1>
          <Workflow>
            <WorkflowStep
              active={state.workflowStep === 1}
              done={state.workflowStep > 1}
            >
              <p class="sm-workflow-header">
                Select the datasets
              </p>
              {
                state.workflowStep === 1
                && <form>
                  <Select
                    class={`w-full ${state.firstStepError ? 'sm-form-error' : ''}`}
                    value={state.selectedDatasetIds}
                    multiple
                    filterable
                    remote
                    remoteMethod={fetchDatasets}
                    loading={datasetLoading.value}
                    placeholder="Start typing name"
                    loadingText="Loading matching entries..."
                    noMatchText="No matches"
                    onChange={handleDatasetSelection}>
                    {
                      datasets.map((ds) => {
                        return (
                          <Option key={ds.id} label={ds.name} value={ds.id}/>
                        )
                      })
                    }
                  </Select>
                  {
                    state.firstStepError
                    && <ErrorLabelText class='mt-0'>
                      Please select at least two datasets to be compared!
                    </ErrorLabelText>
                  }
                  <Button onClick={async() => {
                    if (state.selectedDatasetIds.length > 1) {
                      state.firstStepError = false
                      state.workflowStep = 2
                    } else {
                      state.firstStepError = true
                    }
                  }} type="primary">
                    Next
                  </Button>
                </form>
              }
            </WorkflowStep>
            <WorkflowStep
              active={state.workflowStep === 2}
              done={state.workflowStep > 2}
            >
              <p class="sm-workflow-header">
                Set the grid size
              </p>
              {
                state.workflowStep === 2
                  && <form>
                    <div class='w-full flex flex-row items-center justify-center'>
                      <div class='m-2'>
                        <p>Number of rows</p>
                        <InputNumber
                          size="mini"
                          min={1}
                          max={state.nCols * state.nRows >= 15 ? state.nRows : undefined}
                          value={state.nRows}
                          onChange={(value: number) => { state.nRows = value }}/>
                      </div>
                      <div class='m-2'>
                        <p>Number of columns</p>
                        <InputNumber
                          size="mini"
                          min={1}
                          max={state.nCols * state.nRows >= 15 ? state.nCols : undefined}
                          value={state.nCols}
                          onChange={(value: number) => { state.nCols = value }}/>
                      </div>
                    </div>
                    <div class='dataset-comparison-dialog-grid'>
                      {Array.from(Array(state.nRows).keys()).map((row) => {
                        return (
                          <div key={row} class='dataset-comparison-dialog-row'>
                            {Array.from(Array(state.nCols).keys()).map((col) => {
                              return (
                                <div key={col} class='dataset-comparison-dialog-col'>
                                  {(col + 1) + (row * state.nCols)}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                    {
                      state.secondStepError
                    && <ErrorLabelText class='mt-0'>
                      The grid must have enough cells to all datasets!
                    </ErrorLabelText>
                    }
                    <Button onClick={() => { state.workflowStep = 1 }}>
                      Prev
                    </Button>
                    <Button onClick={() => {
                      // the grid needs to have cells to all datasets
                      if ((state.nCols * state.nRows) < state.selectedDatasetIds.length) {
                        state.secondStepError = true
                      } else {
                        state.secondStepError = false
                        state.workflowStep = 3
                      }
                    }} type="primary">
                      Next
                    </Button>
                  </form>
              }
            </WorkflowStep>

            <WorkflowStep
              active={state.workflowStep === 3}
              done={state.workflowStep > 3}
            >
              <p class="sm-workflow-header">
                Arrange the datasets
              </p>
              {
                state.workflowStep === 3
                && <form>
                  <div class='dataset-comparison-dialog-grid'>
                    {Array.from(Array(state.nRows).keys()).map((row) => {
                      return (
                        <div key={row} class='dataset-comparison-dialog-row'>
                          {Array.from(Array(state.nCols).keys()).map((col) => {
                            return (
                              <div key={col} class='dataset-comparison-dialog-col'>
                                <Select
                                  class={`dataset-cell ${state.finalStepError ? 'sm-form-error' : ''}`}
                                  value={state.arrangement[`${row}-${col}`]}
                                  placeholder=" "
                                  clearable
                                  onChange={(value: string) => { handleSelection(value, row, col) }}>
                                  {
                                    state.showOptions
                                    && datasets
                                      .filter(ds => state.selectedDatasetIds.includes(ds.id)).map((ds) => {
                                        return (
                                          <Option
                                            class='dataset-cell-option'
                                            disabled={Object.values(state.arrangement).includes(ds.id)}
                                            key={ds.id} label={ds.name} value={ds.id}/>
                                        )
                                      })
                                  }
                                </Select>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                  {
                    state.finalStepError
                    && <ErrorLabelText class='mt-0'>
                      Please place all the selected datasets on the grid!
                    </ErrorLabelText>
                  }
                  <Button onClick={() => {
                    state.arrangement = {}
                    state.workflowStep = 2
                  }}>
                    Prev
                  </Button>
                  <Button onClick={async() => {
                    if (Object.values(state.arrangement).length < state.selectedDatasetIds.length) {
                      state.finalStepError = true
                    } else {
                      const link: any = await annotationsLink()
                      await root.$router.push(link)
                    }
                  }} type="primary">
                    Compare
                  </Button>
                </form>
              }
            </WorkflowStep>
          </Workflow>
        </Dialog>
      )
    }
  },
})
