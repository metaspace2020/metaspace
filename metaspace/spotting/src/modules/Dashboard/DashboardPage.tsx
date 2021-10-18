import { defineComponent, reactive } from '@vue/composition-api'
import './DashboardPage.scss'
import { Option, Select } from '../../../../webapp/src/lib/element-ui'
import { keyBy, merge, orderBy } from 'lodash-es'
import { DashboardScatterChart } from './DashboardScatterChart'
import { classification } from '../../data/custom_classification'
import { datasets } from '../../data/datasets'
import { predictions } from '../../data/predictions'
import { pathways } from '../../data/pathways'

interface Options{
  xAxis: any
  yAxis: any
  aggregation: any
}

interface DashboardState {
  filter: any
  xAxisValues: any
  yAxisValues: any
  data: any
  visualMap: any
  options: Options
  selectedView: number
}

const VIEW = {
  SCATTER: 1,
  HEATMAP: 2,
}

const AXIS_VALUES = [
  {
    label: 'Polarity',
    src: 'Polarity',
  },
  {
    label: 'Adducts',
    src: 'adduct',
  },
  {
    label: 'Neutral losses',
    src: 'neutral_loss',
  },
  {
    label: 'Matrix',
    src: 'Matrix short',
  },
  {
    label: 'Molecule',
    src: 'formula',
  },
  {
    label: 'Technology',
    src: 'Technology',
  },
  {
    label: 'Pathway',
    src: 'name_short',
  },
  {
    label: 'Class',
    src: 'fine_class',
  },
  {
    label: 'Dataset',
    src: 'dataset_name',
  },
]

const AGGREGATED_VALUES = [
  {
    label: 'Prediction',
    src: 'coarse_class',
  },
  {
    label: 'Intensity',
    src: 'spot_intensity',
  },
  {
    label: 'Simple count',
    src: 'in_n_spots',
  },
]

const FILTER_VALUES = [
  {
    label: 'Polarity',
    src: 'Polarity',
  },
  {
    label: 'Adducts',
    src: 'adduct',
  },
  {
    label: 'Neutral losses',
    src: 'neutral_loss',
  },
  {
    label: 'Matrix',
    src: 'Matrix short',
  },
  {
    label: 'Prediction',
    src: 'prediction',
  },
  {
    label: 'Technology',
    src: 'Technology',
  },
  {
    label: 'Pathway',
    src: 'name_short',
  },
  {
    label: 'Class',
    src: 'fine_class',
  },
  {
    label: 'Dataset',
    src: 'dataset_name',
  },
  {
    label: 'Intensity',
    src: 'intensity',
  },
]

const CLASSIFICATION_METRICS = {
  fine_class: true,
  coarse_class: true,
}

const DATASET_METRICS = {
  Polarity: true,
  Technology: true,
  'Matrix short': true,
}

const PREDICTION_METRICS = {
  adduct: true,
  dataset_name: true,
  formula: true,
  neutral_loss: true,
  in_n_spots: true,
  spot_intensity: true,
}

const PATHWAY_METRICS = {
  name_short: true,
}

export default defineComponent({
  name: 'dashboard',
  setup: function(props, ctx) {
    const { $route, $store } = ctx.root
    const state = reactive<DashboardState>({
      filter: undefined,
      xAxisValues: [],
      yAxisValues: [],
      data: [],
      visualMap: {},
      options: {
        xAxis: null,
        yAxis: null,
        aggregation: null,
      },
      selectedView: VIEW.SCATTER,
    })

    const buildValues = () => {
      let auxX : any = null
      let auxY : any = null
      let auxAgg : any = null

      if (Object.keys(CLASSIFICATION_METRICS).includes(state.options.xAxis)) {
        auxX = classification
      } else if (Object.keys(DATASET_METRICS).includes(state.options.xAxis)) {
        auxX = datasets
      } else if (Object.keys(PREDICTION_METRICS).includes(state.options.xAxis)) {
        auxX = predictions
      } else if (Object.keys(PATHWAY_METRICS).includes(state.options.xAxis)) {
        auxX = pathways
      }

      if (Object.keys(CLASSIFICATION_METRICS).includes(state.options.yAxis)) {
        auxY = classification
      } else if (Object.keys(DATASET_METRICS).includes(state.options.yAxis)) {
        auxY = datasets
      } else if (Object.keys(PREDICTION_METRICS).includes(state.options.yAxis)) {
        auxY = predictions
      } else if (Object.keys(PATHWAY_METRICS).includes(state.options.yAxis)) {
        auxY = pathways
      }

      if (Object.keys(CLASSIFICATION_METRICS).includes(state.options.aggregation)) {
        auxAgg = classification
      } else if (Object.keys(DATASET_METRICS).includes(state.options.aggregation)) {
        auxAgg = datasets
      } else if (Object.keys(PREDICTION_METRICS).includes(state.options.aggregation)) {
        auxAgg = predictions
      } else if (Object.keys(PATHWAY_METRICS).includes(state.options.aggregation)) {
        auxAgg = pathways
      }

      const auxXWithInternal = keyBy(auxX, 'internal_id')
      const auxAggWithInternal = keyBy(auxAgg, 'internal_id')
      const isContinuous = state.options.aggregation !== 'coarse_class'
      const aggregations : any = Object.keys(keyBy(auxAgg, state.options.aggregation)).map((category: any) => {
        return {
          value: isContinuous ? parseFloat(category) : category,
          label: category,
        }
      })
      const chartValues : any = {}
      let maxValue : number = 1
      const availableAggregations : any = []

      console.log('aggregations', aggregations)

      Object.keys(auxXWithInternal).forEach((internalId : any) => {
        auxXWithInternal[internalId].yAxis = auxY.filter((a: any) => a.internal_id === parseInt(internalId, 10))
        auxXWithInternal[internalId].xAxis = auxX.filter((a: any) => a.internal_id === parseInt(internalId, 10))
        auxXWithInternal[internalId].xAxisCount = auxXWithInternal[internalId].xAxis.length
        auxXWithInternal[internalId].yAxisCount = auxXWithInternal[internalId].yAxis.length
        const auxAggValue : any = auxAggWithInternal[internalId] !== undefined
          ? auxAggWithInternal[internalId][state.options.aggregation] : null
        auxXWithInternal[internalId].aggregation = aggregations.find((category: any) => auxAggValue !== null
        && category.value
          === (isContinuous ? parseFloat(auxAggValue) : auxAggValue))

        if (auxAggWithInternal[internalId]) {
          console.log('A', auxAggValue, state.options.aggregation, auxAggWithInternal[internalId],
            auxXWithInternal[internalId].aggregation)
        }

        if (maxValue < auxXWithInternal[internalId].yAxisCount) {
          maxValue = auxXWithInternal[internalId].yAxisCount
        }
        if (auxXWithInternal[internalId].yAxis.length > 0) {
          const yKey = auxXWithInternal[internalId].yAxis[0][state.options.yAxis]
          chartValues[
            `${auxXWithInternal[internalId][state.options.xAxis]}-${yKey}`] =
            auxXWithInternal[internalId]
        }
      })

      const dotValues : any = []
      let counter = 0
      // console.log('SIZE', state.yAxisValues.length * state.xAxisValues.length)
      state.yAxisValues.forEach((yKey: any, yIndex: number) => {
        state.xAxisValues.forEach((xKey: any, xIndex: number) => {
          const auxValue = chartValues[`${xKey}-${yKey}`]
            ? chartValues[`${xKey}-${yKey}`].yAxisCount : 0
          if (auxValue && !availableAggregations.includes(chartValues[`${xKey}-${yKey}`].aggregation?.value)) {
            availableAggregations.push(chartValues[`${xKey}-${yKey}`].aggregation)
          }

          if (auxValue) {
            dotValues.push({
              value: [xIndex, yIndex, (auxValue / maxValue) * 5,
                chartValues[`${xKey}-${yKey}`]?.aggregation?.value || 0],
              label: {},
            })
          }

          counter += 1
        })
      })

      state.visualMap = {
        type: state.options.aggregation !== 'coarse_class' ? 'continuous' : 'piecewise',
        show: true,
        dimension: 3,
        top: 'top',
        left: 'right',
      }

      console.log('VIS', state.visualMap)

      if (state.visualMap.type === 'piecewise') {
        state.visualMap.pieces = availableAggregations
      }

      console.log('YOxxx', chartValues)
      state.data = dotValues
    }

    const handleAggregationChange = (value: any) => {
      state.options.aggregation = value
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation) {
        // console.log('HEY2')
        buildValues()
      }
    }

    const handleAxisChange = (value: any, isXAxis : boolean = true) => {
      // console.log('HE', value)
      const axis : any = []
      let src : any = ''

      if (Object.keys(CLASSIFICATION_METRICS).includes(value)) {
        src = classification
      } else if (Object.keys(DATASET_METRICS).includes(value)) {
        src = datasets
      } else if (Object.keys(PREDICTION_METRICS).includes(value)) {
        src = predictions
      } else if (Object.keys(PATHWAY_METRICS).includes(value)) {
        src = pathways
      }

      if (!src) {
        return
      }

      src.forEach((row: any) => {
        if (!axis.includes(row[value])) {
          axis.push(row[value])
        }
      })
      axis.sort()

      if (isXAxis) {
        state.xAxisValues = axis
      } else {
        state.yAxisValues = axis
      }

      if (state.options.xAxis && state.options.yAxis && state.options.aggregation) {
        buildValues()
      }
    }

    const renderFilters = () => {
      return (
        <div class='filter-container'>
          <div class='filter-box m-2'>
            <span class='x-axis-label mb-2'>X axis</span>
            <Select
              class='select-box-mini'
              value={state.options.xAxis}
              onChange={(value: number) => {
                state.options.xAxis = value
                handleAxisChange(value)
              }}
              placeholder='Class'
              size='mini'>
              {
                orderBy(AXIS_VALUES, ['label'], ['asc']).map((option: any) => {
                  return <Option label={option.label} value={option.src}/>
                })
              }
            </Select>
          </div>
          <div class='filter-box m-2'>
            <span class='y-axis-label mb-2'>Y axis</span>
            <Select
              class='select-box-mini'
              value={state.options.yAxis}
              onChange={(value: number) => {
                state.options.yAxis = value
                handleAxisChange(value, false)
              }}
              placeholder='Method'
              size='mini'>
              {
                orderBy(AXIS_VALUES, ['label'], ['asc']).map((option: any) => {
                  return <Option label={option.label} value={option.src}/>
                })
              }
            </Select>
          </div>
          <div class='filter-box m-2'>
            <span class='aggregation-label mb-2'>Aggregated method</span>
            <Select
              class='select-box-mini'
              value={state.options.aggregation}
              onChange={(value: number) => {
                state.options.aggregation = value
                handleAggregationChange(value)
              }}
              placeholder='Method'
              size='mini'>
              {
                orderBy(AGGREGATED_VALUES, ['label'], ['asc']).map((option: any) => {
                  return <Option label={option.label} value={option.src}/>
                })
              }
            </Select>
          </div>
          <div class='filter-box m-2'>
            <span class='filter-label mb-2'>Filters</span>
            <div class='flex flex-wrap'>
              <Select
                class='select-box-mini mr-2'
                value={state.options.aggregation}
                onChange={(value: number) => {
                  state.options.aggregation = value
                }}
                placeholder='Neutral losses'
                size='mini'>
                {
                  orderBy(FILTER_VALUES, ['label'], ['asc']).map((option: any) => {
                    return <Option label={option.label} value={option.src}/>
                  })
                }
              </Select>
              <Select
                class='select-box-mini mr-2'
                value={state.options.aggregation}
                onChange={(value: number) => {
                  state.options.aggregation = value
                }}
                placeholder='Adduct'
                size='mini'>
                <Option label="5%" value={0.05}/>
                <Option label="10%" value={0.1}/>
                <Option label="20%" value={0.2}/>
                <Option label="50%" value={0.5}/>
              </Select>
            </div>
          </div>
        </div>
      )
    }

    const renderVisualizations = () => {
      return (
        <div class='visualization-container'>
          <div class='visualization-selector'>
            <span class='filter-label'>Visualization</span>
            <div class={`icon-holder ${state.selectedView === VIEW.SCATTER ? 'selected' : ''}`}>
              <i class="vis-icon el-icon-s-data mr-6 text-4xl" onClick={() => { state.selectedView = VIEW.SCATTER }}/>
            </div>
            <div class={`icon-holder ${state.selectedView === VIEW.HEATMAP ? 'selected' : ''}`}>
              <i class="vis-icon el-icon-s-grid mr-6 text-4xl" onClick={() => { state.selectedView = VIEW.HEATMAP }}/>
            </div>
          </div>
        </div>
      )
    }

    const renderDashboardInstructions = () => {
      return (
        <div class='dashboard-instructions'>
          <i class="el-icon-info mr-6 text-4xl"/>
          <div class='flex flex-col text-xs w-2/4'>
            <p class='instruction-title mb-2'>Steps:</p>
            <p>1 - Select the x axis metric in the <span class='x-axis-label'>red</span> zone;</p>
            <p>2 - Select the y axis metric in the <span class='y-axis-label'>green</span> zone;</p>
            <p>3 - Select the aggregated method (color) in the <span class='aggregation-label'>blue</span> zone;</p>
            <p>4 - Apply the filters you desire.</p>
          </div>
        </div>
      )
    }

    const renderScatterplot = () => {
      return (
        <div class='chart-container'>
          <DashboardScatterChart
            xAxis={state.xAxisValues}
            yAxis={state.yAxisValues}
            data={state.data}
            visualMap={state.visualMap}
          />
        </div>
      )
    }

    return () => {
      const showChart = true

      return (
        <div class={'dashboard-container'}>
          {renderFilters()}
          {renderVisualizations()}
          <div class={'content-container'}>
            {!showChart && renderDashboardInstructions()}
            {showChart && renderScatterplot()}
          </div>
        </div>
      )
    }
  },
})
