import { defineComponent, onMounted, reactive } from '@vue/composition-api'
import './DashboardPage.scss'
import { Option, Select } from '../../../../webapp/src/lib/element-ui'
import { groupBy, keyBy, merge, orderBy, uniq, uniqBy } from 'lodash-es'
import { DashboardScatterChart } from './DashboardScatterChart'
import { predictions } from '../../data/predictions'

interface Options{
  xAxis: any
  yAxis: any
  aggregation: any
}

interface DashboardState {
  filter: any
  xAxisValues: any
  rawData: any
  yAxisValues: any
  data: any
  visualMap: any
  options: Options
  selectedView: number
  loading: boolean
  predictions: any
  datasets : any
  classification : any
  pathways : any
  wellmap : any
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
    src: 'coarse_class',
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
    src: 'spot_intensity',
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
    const { $store, $router, $route } = ctx.root
    const state = reactive<DashboardState>({
      filter: {
        src: null,
        value: null,
        options: [],
      },
      xAxisValues: [],
      yAxisValues: [],
      data: [],
      rawData: undefined,
      visualMap: {},
      options: {
        xAxis: null,
        yAxis: null,
        aggregation: null,
      },
      selectedView: VIEW.SCATTER,
      loading: false,
      predictions: null,
      datasets: null,
      classification: null,
      pathways: null,
      wellmap: null,
    })

    onMounted(async() => {
      const fromServer = true
      try {
        console.log('INDO')
        state.loading = true
        const baseUrl = 'https://sm-spotting-project.s3.eu-west-1.amazonaws.com/'
        // const response = await fetch(baseUrl + 'all_predictions_12-Jul-2021.json')
        // const predictions = await response.json()
        const datasetResponse = await fetch(baseUrl + 'datasets.json')
        const datasets = await datasetResponse.json()
        const chemClassResponse = await fetch(baseUrl + 'custom_classification.json')
        const classification = await chemClassResponse.json()
        const pathwayResponse = await fetch(baseUrl + 'pathways.json')
        const pathways = await pathwayResponse.json()
        const wellmapResponse = await fetch(baseUrl + 'wellmap.json')
        const wellmap = await wellmapResponse.json()

        state.predictions = predictions
        state.datasets = datasets
        state.classification = classification
        state.pathways = pathways
        state.wellmap = wellmap

        const datasetsById = keyBy(datasets, 'Clone ID')
        const chemClassById = groupBy(classification, 'name_short')
        const pathwayById = groupBy(pathways, 'name_short')
        const wellmapById = groupBy(wellmap, 'name_short')

        let count = 0
        const predWithDs = predictions.map((prediction: any) => {
          if (datasetsById[prediction.dataset_id]) {
            return {
              Polarity: datasetsById[prediction.dataset_id].Polarity,
              'Matrix short': datasetsById[prediction.dataset_id]['Matrix short'],
              'Matrix long': datasetsById[prediction.dataset_id]['Matrix long'],
              ...prediction,
            }
          }

          return prediction
        })

        const predWithClass : any = []
        predWithDs.forEach((prediction: any) => {
          if (chemClassById[prediction.name_short]) {
            chemClassById[prediction.name_short].forEach((classification: any) => {
              predWithClass.push({ ...classification, ...prediction })
            })
            count += chemClassById[prediction.name_short].length
          } else {
            predWithClass.push(prediction)
          }
        })

        count = 0
        const predWithPathway : any = []
        predWithClass.forEach((prediction: any) => {
          if (pathwayById[prediction.name_short]) {
            pathwayById[prediction.name_short].forEach((pathway: any) => {
              predWithPathway.push({ ...pathway, ...prediction })
            })
            count += pathwayById[prediction.name_short].length
          } else {
            predWithPathway.push(prediction)
          }
        })

        count = 0
        const predWithWellmap : any = []
        predWithPathway.forEach((prediction: any) => {
          if (wellmapById[prediction.name_short]) {
            wellmapById[prediction.name_short].forEach((wellmap: any) => {
              predWithWellmap.push({ ...wellmap, ...prediction })
            })
            count += wellmapById[prediction.name_short].length
          } else {
            predWithWellmap.push(prediction)
          }
        })
        console.log('FINALERA', predWithWellmap)
        state.rawData = predWithWellmap
      } catch (e) {
        console.log('predE', e)
      } finally {
        state.loading = false
      }

      if ($route.query.xAxis) {
        handleAxisChange($route.query.xAxis)
      }
      if ($route.query.yAxis) {
        handleAxisChange($route.query.yAxis, false)
      }
      if ($route.query.agg) {
        handleAggregationChange($route.query.agg)
      }
      if ($route.query.filter) {
        handleFilterSrcChange($route.query.filter)
      }

      if ($route.query.filterValue) {
        handleFilterValueChange($route.query.filterValue)
      }

      console.log('INDO')
    })

    const buildValues = () => {
      let auxData : any = null
      let filteredData : any = state.rawData

      if (state.filter.src && state.filter.value) {
        console.log('filtrando', state.filter.src, state.filter.value)
        filteredData = filteredData.filter((data: any) => {
          return data[state.filter.src] === state.filter.value
        })
      }

      auxData = groupBy(filteredData, state.options.xAxis)
      let maxValue : number = 1
      Object.keys(auxData).forEach((key: string) => {
        auxData[key] = groupBy(auxData[key], state.options.yAxis)

        Object.keys(auxData[key]).forEach((xKey: any) => {
          if (auxData[key][xKey].length > maxValue) {
            maxValue = auxData[key][xKey].length
          }
        })
      })

      const dotValues : any = []
      let availableAggregations : any = []

      state.xAxisValues.forEach((xKey: any, xIndex: number) => {
        state.yAxisValues.forEach((yKey: any, yIndex: number) => {
          if (auxData[xKey] && auxData[xKey][yKey]) {
            availableAggregations = availableAggregations.concat(Object.keys(keyBy(auxData[xKey][yKey],
              state.options.aggregation)))

            const auxValue = auxData[xKey][yKey].length
            dotValues.push({
              value: [xIndex, yIndex, (auxValue / maxValue) * 10, auxData[xKey][yKey][0][state.options.aggregation]],
              label: {},
            })
          }
        })
      })

      availableAggregations = uniq(availableAggregations).map((agg: any) => {
        return {
          label: agg,
          value: agg,
        }
      })

      state.visualMap = {
        type: state.options.aggregation !== 'coarse_class' ? 'continuous' : 'piecewise',
        show: true,
        dimension: 3,
        top: 'bottom',
        left: 'right',
      }

      if (state.visualMap.type === 'piecewise') {
        state.visualMap.pieces = availableAggregations
        state.visualMap.show = availableAggregations.length > 0
      }
      state.data = dotValues
    }

    const handleAggregationChange = (value: any) => {
      state.options.aggregation = value
      $store.commit('setAgg', value)
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation) {
        buildValues()
      }
    }

    const handleFilterValueChange = (value: any) => {
      state.filter.value = value
      $store.commit('setFilterValue', value)
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation) {
        buildValues()
      }
    }
    const handleFilterSrcChange = (value: any) => {
      state.filter.src = value
      $store.commit('setFilter', value)
      console.log('src', state.filter.src)
      let src : any = null

      if (Object.keys(CLASSIFICATION_METRICS).includes(value)) {
        src = state.classification
      } else if (Object.keys(DATASET_METRICS).includes(value)) {
        src = state.datasets
      } else if (Object.keys(PREDICTION_METRICS).includes(value)) {
        src = state.predictions
      } else if (Object.keys(PATHWAY_METRICS).includes(value)) {
        src = state.pathways
      }

      state.filter.options = Object.keys(keyBy(src, value)).sort().filter((option: any) => option !== null
        && option !== undefined && option !== '')

      console.log('src', src)
    }

    const handleAxisChange = (value: any, isXAxis : boolean = true) => {
      // console.log('HE', value)
      const axis : any = []
      let src : any = ''

      if (isXAxis) {
        state.options.xAxis = value
        $store.commit('setXAxis', value)
      } else {
        state.options.yAxis = value
        $store.commit('setYAxis', value)
      }

      if (Object.keys(CLASSIFICATION_METRICS).includes(value)) {
        src = state.classification
      } else if (Object.keys(DATASET_METRICS).includes(value)) {
        src = state.datasets
      } else if (Object.keys(PREDICTION_METRICS).includes(value)) {
        src = state.predictions
      } else if (Object.keys(PATHWAY_METRICS).includes(value)) {
        src = state.pathways
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
                value={state.filter.src}
                onChange={(value: number) => {
                  handleFilterSrcChange(value)
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
                value={state.filter.value}
                filterable
                clearable
                noDataText='No data'
                onChange={(value: number) => {
                  handleFilterValueChange(value)
                }}
                placeholder='Adduct'
                size='mini'>
                {
                  state.filter.options.map((option: any) => {
                    return <Option label={option} value={option}/>
                  })
                }
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
            {state.loading
            && <div class='absolute'>
              <i
                class="el-icon-loading"
              />
            </div>
            }

          </div>
        </div>
      )
    }
  },
})
