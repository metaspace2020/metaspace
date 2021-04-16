import { computed, defineComponent, reactive } from '@vue/composition-api'
import { Workflow, WorkflowStep } from '../../../components/Workflow'
import { Select, Option, InputNumber, Button, Dialog } from '../../../lib/element-ui'
import { ErrorLabelText } from '../../../components/Form'
import { useQuery } from '@vue/apollo-composable'
import {
  DatasetDetailItem,
  datasetDetailItemsQuery,
} from '../../../api/dataset'
import './DatasetComparisonDialog.scss'
import { encodeParams } from '../../Filters'

interface DatasetComparisonDialogProps {
  title: string
  selectedDatasetIds: string[]
  firstStepError: string
  firstStepLabel: string
  secondStepLabel: string
  thirdStepLabel: string
  finalStepError: string
}

interface DatasetComparisonDialogState {
  selectedDatasetIds: string[]
  workflowStep: number
  nCols: number
  nRows: number
  showOptions: boolean
  firstStepError: boolean
  finalStepError: boolean
  arrangement: {[key: string] : string}
}

export const DatasetComparisonDialog = defineComponent<DatasetComparisonDialogProps>({
  name: 'DatasetComparisonDialog',
  props: {
    title: {
      type: String,
      default: 'Datasets Comparison',
    },
    firstStepError: {
      type: String,
      default: 'Please select at least two datasets to be compared!',
    },
    finalStepError: {
      type: String,
      default: 'Please place all the selected datasets on the grid!',
    },
    firstStepLabel: {
      type: String,
      default: 'Select the datasets',
    },
    secondStepLabel: {
      type: String,
      default: 'Set the grid arrangement',
    },
    thirdStepLabel: {
      type: String,
      default: 'Choose the datasets disposition',
    },
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
      finalStepError: false,
      arrangement: {},
    })
    const {
      result: datasetResult,
      loading: datasetLoading,
    } = useQuery<{allDatasets: DatasetDetailItem}>(datasetDetailItemsQuery, {
      dFilter: { ids: null, polarity: null, metadataType: 'Imaging MS' },
      query: '',
      inpFdrLvls: [10],
      checkLvl: 10,
      offset: 0,
      orderBy: 'ORDER_BY_DATE',
      sortingOrder: 'DESCENDING',
    })
    const dataset = computed(() => datasetResult.value != null ? datasetResult.value.allDatasets : null)

    const annotationsLink = (datasetIds: string[]) => {
      const query = {
        datasetIds: datasetIds,
      }

      return {
        name: 'datasets-comparison',
        query: encodeParams(query),
        params: {
          nCols: state.nCols.toString(),
          nRows: state.nRows.toString(),
          grid: JSON.stringify(state.arrangement),
        },
      }
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
      return (
        <Dialog
          visible
          lockScroll={true}
          onclose={() => emit('close')}
          class="dataset-comparison-dialog sm-content-page el-dialog-lean">
          <h1>{props.title}</h1>
          <Workflow>
            <WorkflowStep
              active={state.workflowStep === 1}
              done={state.workflowStep > 1}
            >
              <p class="sm-workflow-header">
                {props.firstStepLabel}
              </p>
              {
                state.workflowStep === 1
                && <form>
                  <Select
                    class={`w-full ${state.firstStepError ? 'sm-form-error' : ''}`}
                    value={state.selectedDatasetIds}
                    multiple
                    placeholder=" "
                    onChange={handleDatasetSelection}>
                    {
                      Array.isArray(dataset?.value)
                        && dataset?.value.map((ds) => {
                          return (
                            <Option key={ds.id} label={ds.name} value={ds.id}/>
                          )
                        })
                    }
                  </Select>
                  {
                    state.firstStepError
                    && <ErrorLabelText class='mt-0'>{props.firstStepError}</ErrorLabelText>
                  }
                  <Button onClick={() => {
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
                {props.secondStepLabel}

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
                    <Button onClick={() => { state.workflowStep = 1 }}>
                      Prev
                    </Button>
                    <Button onClick={() => { state.workflowStep = 3 }} type="primary">
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
                {props.thirdStepLabel}

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
                                    && Array.isArray(dataset?.value)
                                    && dataset?.value.map((ds) => {
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
                    && <ErrorLabelText class='mt-0'>{props.finalStepError}</ErrorLabelText>
                  }
                  <Button onClick={() => { state.workflowStep = 2 }}>
                    Prev
                  </Button>
                  <Button onClick={() => {
                    if (Object.values(state.arrangement).length < state.selectedDatasetIds.length) {
                      state.finalStepError = true
                    } else {
                      root.$router.push(annotationsLink(state.selectedDatasetIds.sort()))
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
