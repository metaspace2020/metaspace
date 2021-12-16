import { defineComponent, onMounted, reactive } from '@vue/composition-api'
import './DashboardPage.scss'
import { Option, Select, Pagination, InputNumber, Button } from '../../lib/element-ui'
import { cloneDeep, groupBy, keyBy, orderBy, uniq } from 'lodash-es'
import { DashboardScatterChart } from './DashboardScatterChart'
import { DashboardHeatmapChart } from './DashboardHeatmapChart'
import { ShareLink } from './ShareLink'
import { ChartSettings } from './ChartSettings'
import { predictions } from '../../data/predictions'
import createColormap from '../../lib/createColormap'

interface Options{
  xAxis: any
  yAxis: any
  aggregation: any
  valueMetric: any
}

interface DashboardState {
  colormap: any
  filter: any[]
  xAxisValues: any
  rawData: any
  yAxisValues: any
  data: any
  visualMap: any
  options: Options
  selectedView: number
  loading: boolean
  loadingFilterOptions: boolean
  buildingChart: boolean
  predictions: any
  datasets : any
  classification : any
  pathways : any
  wellmap : any
  pagination: any
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
    src: 'dataset_id',
  },
]

const AGGREGATED_VALUES = [
  {
    label: 'Prediction',
    src: 'pred_val',
  },
  {
    label: 'Intensity',
    src: 'spot_intensity',
  },
  {
    label: 'Simple count',
    src: 'pred_twostate',
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
    label: 'Value Prediction',
    src: 'pred_val',
    isNumeric: true,
  },
  {
    label: 'State Prediction',
    src: 'pred_twostate',
    isBoolean: true,
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
    src: 'dataset_id',
  },
  // {
  //   label: 'Intensity',
  //   src: 'spot_intensity',
  // },
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
  dataset_id: true,
  formula: true,
  neutral_loss: true,
  in_n_spots: true,
  spot_intensity: true,
  pred_val: true,
  pred_twostate: true,
}

const PATHWAY_METRICS = {
  name_short: true,
}

const VALUE_METRICS = {
  count: {
    label: 'Count',
    src: 1,
  },
  average: {
    label: 'Average',
    src: 2,
  },
}

export default defineComponent({
  name: 'dashboard',
  setup: function(props, ctx) {
    const { $route, $router } = ctx.root
    const pageSizes = [5, 15, 30, 100]
    const filterItem = {
      src: null,
      value: null,
      isNumeric: false,
      isBoolean: false,
      options: [],
    }
    const state = reactive<DashboardState>({
      colormap: null,
      filter: [cloneDeep(filterItem)],
      xAxisValues: [],
      yAxisValues: [],
      data: [],
      rawData: undefined,
      visualMap: {},
      options: {
        xAxis: null,
        yAxis: null,
        aggregation: null,
        valueMetric: VALUE_METRICS.count.src,
      },
      pagination: {
        nOfPages: 1,
        pageSize: 5,
        currentPage: 1,
        total: 1,
      },
      selectedView: VIEW.SCATTER,
      loading: false,
      loadingFilterOptions: false,
      buildingChart: false,
      predictions: null,
      datasets: null,
      classification: null,
      pathways: null,
      wellmap: null,
    })

    onMounted(async() => {
      try {
        console.log('Downloading files')
        state.loading = true
        const baseUrl = 'https://sm-spotting-project.s3.eu-west-1.amazonaws.com/'
        const response = await fetch(baseUrl + 'all_predictions_14-Dec-2021.json')
        const predictions = await response.json()
        const datasetResponse = await fetch(baseUrl + 'datasets_updated.json')
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
              Technology: datasetsById[prediction.dataset_id].Technology,
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
        console.log('File loaded', predWithWellmap)
        state.rawData = predWithWellmap
      } catch (e) {
        console.log('error', e)
      } finally {
        state.loading = false
      }

      if ($route.query.page) {
        state.pagination.currentPage = parseInt($route.query.page, 10)
      }
      if ($route.query.pageSize) {
        state.pagination.pageSize = parseInt($route.query.pageSize, 10)
      }
      if ($route.query.metric) {
        state.options.valueMetric = parseInt($route.query.metric, 10)
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
        const filterValue = state.filter[0].isBoolean ? parseInt($route.query.filterValue, 10)
          : $route.query.filterValue

        handleFilterValueChange(filterValue)
      }

      buildValues()
    })

    const buildValues = () => {
      let auxData : any = null
      let filteredData : any = state.rawData
      let min : number = 0
      let max : number = 1
      state.buildingChart = true

      state.filter.forEach((filter: any) => {
        if (filter.src && filter.value) {
          filteredData = filteredData.filter((data: any) => {
            const filterValue = filter.value === 'null' ? null : filter.value
            return filter.isNumeric ? parseFloat(data[filter.src]) <= parseFloat(filter.value)
              : data[filter.src] === filterValue
          })
        }
      })

      auxData = groupBy(filteredData, state.options.xAxis)
      let maxValue : number = 1
      Object.keys(auxData).forEach((key: string) => {
        auxData[key] = groupBy(auxData[key], state.options.yAxis)

        Object.keys(auxData[key]).forEach((yKey: any) => {
          if (auxData[key][yKey].length > maxValue && state.xAxisValues.includes(key)) {
            maxValue = auxData[key][yKey].length
          }
        })
      })

      const dotValues : any = []
      let availableAggregations : any = []

      state.xAxisValues.forEach((xKey: any, xIndex: number) => {
        let totalCount : number = 1
        let yMaxValue : number = 0

        if (auxData[xKey] && state.options.valueMetric === VALUE_METRICS.average.src) {
          Object.keys(auxData[xKey]).forEach((metricKey: string) => {
            totalCount += auxData[xKey][metricKey].length
          })
          Object.keys(auxData[xKey]).forEach((metricKey: string) => {
            if (auxData[xKey][metricKey].length > yMaxValue) {
              yMaxValue = auxData[xKey][metricKey].length
            }
          })
          yMaxValue = yMaxValue / totalCount
        }

        state.yAxisValues.forEach((yKey: any, yIndex: number) => {
          if (auxData[xKey] && auxData[xKey][yKey]) {
            let pointAggregation : any = auxData[xKey][yKey][0][state.options.aggregation]

            if (state.options.aggregation === 'pred_twostate') {
              const predAgg : any = groupBy(auxData[xKey][yKey],
                state.options.aggregation)
              pointAggregation = (predAgg[0] || []).length + (predAgg[1] || []).length
              availableAggregations = availableAggregations.concat(pointAggregation)
            } else {
              availableAggregations = availableAggregations.concat(Object.keys(keyBy(auxData[xKey][yKey],
                state.options.aggregation)))
            }

            const value : number = state.options.valueMetric === VALUE_METRICS.count.src ? auxData[xKey][yKey].length
              : (auxData[xKey][yKey].length / totalCount)
            const normalizedValue = state.options.valueMetric === VALUE_METRICS.count.src
              ? (value / maxValue) : (value / yMaxValue)

            dotValues.push({
              value: [xIndex, yIndex, normalizedValue * 15, pointAggregation, value],
              label: { key: yKey, molecule: auxData[xKey][yKey][0].formula },
            })
          }
        })
      })

      let colormap : any = state.colormap
      let colorSteps : number = 1
      const colors : any = []

      if (!Array.isArray(colormap)) {
        colormap = createColormap('Viridis').map((color: any) => {
          return `rgba(${color.join(',')})`
        })
      }

      availableAggregations = uniq(availableAggregations).sort()
      colorSteps = availableAggregations.length
        ? (colormap.length / availableAggregations.length) : 1
      availableAggregations = availableAggregations.map((agg: any, aggIndex: number) => {
        if (agg < min) {
          min = agg
        }
        if (agg > max) {
          max = agg
        }

        colors.push(colormap[Math.floor(aggIndex * colorSteps)])
        return {
          label: agg,
          value: agg,
        }
      })

      state.visualMap = {
        type: state.options.aggregation !== 'coarse_class' ? 'continuous' : 'piecewise',
        show: true,
        dimension: 3,
        left: 'center',
        inRange: {
          color: colors,
        },
        orient: 'horizontal',
        min: 0,
        max: 1,
      }

      if (state.visualMap.type === 'piecewise') {
        state.visualMap.pieces = availableAggregations
        state.visualMap.show = availableAggregations.length > 0
      } else {
        state.visualMap.min = min
        state.visualMap.max = max
      }
      state.data = dotValues
      if (state.data.length === 0) {
        state.visualMap = { show: false }
      }

      state.buildingChart = false
    }

    const handleAggregationChange = (value: any) => {
      state.options.aggregation = value
      $router.replace({ name: 'dashboard', query: { ...getQueryParams(), agg: value } })
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation) {
        buildValues()
      }
    }

    const handleValueMetricChange = (value: any) => {
      state.options.valueMetric = value
      $router.replace({ name: 'dashboard', query: { ...getQueryParams(), metric: value } })
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation) {
        buildValues()
      }
    }

    const parseBooleanLabel = (value: string) => {
      if (parseInt(value, 10) === 0) {
        return 'False'
      } else {
        return 'True'
      }
    }

    const handleFilterValueChange = (value: any, idx : any = 0) => {
      state.filter[idx].value = value
      $router.replace({ name: 'dashboard', query: { ...getQueryParams(), filterValue: value } })

      if (state.options.xAxis && state.options.yAxis && state.options.aggregation) {
        buildValues()
      }
    }

    const removeFilterItem = () => {
      state.filter.pop()
    }

    const addFilterItem = () => {
      const filters = state.filter
      filters.push(cloneDeep(filterItem))
      state.filter = filters
    }

    const handleColormapChange = (colors: any) => {
      state.colormap = colors.map((color: any) => {
        return `rgba(${color.join(',')})`
      })
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation) {
        buildValues()
      }
    }

    const getQueryParams = () => {
      const queryObj : any = {
        filter: state.filter[0].src,
        filterValue: state.filter[0].value,
        xAxis: state.options.xAxis,
        yAxis: state.options.yAxis,
        agg: state.options.aggregation,
        metric: state.options.valueMetric,
        page: state.pagination.currentPage,
        pageSize: state.pagination.pageSize,
      }

      Object.keys(queryObj).forEach((key: string) => {
        if (!queryObj[key]) {
          delete queryObj[key]
        }
      })

      return queryObj
    }

    const handleFilterSrcChange = (value: any, idx : any = 0) => {
      state.filter[idx].src = value

      if (state.options.xAxis && state.options.yAxis && state.options.aggregation
        && state.filter[idx].value !== null && state.filter[idx].value !== undefined) {
        handleFilterValueChange(null, idx)
        buildValues()
      }

      $router.replace({ name: 'dashboard', query: { ...getQueryParams(), filter: value } })

      let src : any = null
      const filterSpec = FILTER_VALUES.find((filter: any) => filter.src === value)
      if (filterSpec && filterSpec.isNumeric) {
        state.filter[idx].isNumeric = true
        state.filter[idx].isBoolean = false
        return
      } else if (filterSpec && filterSpec.isBoolean) {
        state.filter[idx].isNumeric = false
        state.filter[idx].isBoolean = true
      } else {
        state.filter[idx].isNumeric = false
        state.filter[idx].isBoolean = false
      }
      state.loadingFilterOptions = true

      if (Object.keys(CLASSIFICATION_METRICS).includes(value)) {
        src = state.classification
      } else if (Object.keys(DATASET_METRICS).includes(value)) {
        src = state.datasets
      } else if (Object.keys(PREDICTION_METRICS).includes(value)) {
        src = state.predictions
      } else if (Object.keys(PATHWAY_METRICS).includes(value)) {
        src = state.pathways
      }

      state.filter[idx].options = Object.keys(keyBy(src, value)).sort().filter((option: any) => option !== null
        && option !== undefined && option !== '')
      state.loadingFilterOptions = false
    }

    const handleAxisChange = (value: any, isXAxis : boolean = true) => {
      let axis : any = []
      let src : any = ''

      if (isXAxis) {
        state.options.xAxis = value
        $router.replace({ name: 'dashboard', query: { ...getQueryParams(), xAxis: value } })
      } else {
        state.options.yAxis = value
        $router.replace({ name: 'dashboard', query: { ...getQueryParams(), yAxis: value } })
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
      axis = axis.filter((item: any) => item && item !== 'null' && item !== 'none')

      if (isXAxis) {
        const start = ((state.pagination.currentPage - 1) * state.pagination.pageSize)
        const end = ((state.pagination.currentPage - 1) * state.pagination.pageSize) + state.pagination.pageSize
        state.pagination.total = axis.length
        state.xAxisValues = axis.slice(start, end)
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
              disabled={state.loading}
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
              disabled={state.loading}
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
                handleAggregationChange(value)
              }}
              disabled={state.loading}
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
            <span class='metric-label mb-2'>Value metric</span>
            <Select
              class='select-box-mini'
              value={state.options.valueMetric}
              onChange={(value: number) => {
                handleValueMetricChange(value)
              }}
              disabled={state.loading}
              placeholder='Method'
              size='mini'>
              {
                orderBy(VALUE_METRICS, ['label'], ['asc']).map((option: any) => {
                  return <Option label={option.label} value={option.src}/>
                })
              }
            </Select>
          </div>

          <div class='filter-box m-2'>
            <span class='filter-label mb-2'>Filters</span>
            {
              state.filter.map((filter: any, filterIdx: number) => {
                return (
                  <div class='flex flex-wrap justify-center items-center'>
                    <Select
                      class='select-box-mini mr-2'
                      value={filter.src}
                      onChange={(value: number) => {
                        handleFilterSrcChange(value, filterIdx)
                      }}
                      clearable
                      disabled={state.loading}
                      placeholder='Neutral losses'
                      size='mini'>
                      {
                        orderBy(FILTER_VALUES, ['label'], ['asc']).map((option: any) => {
                          return <Option
                            disabled={state.filter.map((item: any) => item.src).includes(option.src)}
                            label={option.label}
                            value={option.src}/>
                        })
                      }
                    </Select>
                    {
                      !filter.isNumeric
                      && <Select
                        class='select-box-mini mr-2'
                        value={
                          filter.isBoolean && filter.value
                            ? parseInt(filter.value, 10) : filter.value
                        }
                        loading={state.loadingFilterOptions}
                        filterable
                        clearable
                        noDataText='No data'
                        onChange={(value: number) => {
                          handleFilterValueChange(value, filterIdx)
                        }}
                        disabled={state.loading}
                        placeholder='Adduct'
                        size='mini'>
                        {
                          filter.options.map((option: any) => {
                            return <Option
                              label={filter.isBoolean ? parseBooleanLabel(option) : option}
                              value={filter.isBoolean ? parseInt(option, 10) : option}/>
                          })
                        }
                      </Select>
                    }
                    {
                      filter.isNumeric
                      && !filter.isBoolean
                      && <InputNumber
                        class='select-box-mini mr-2'
                        size="mini"
                        min={0}
                        max={1}
                        step={0.001}
                        value={parseFloat(state.filter[0].value)}
                        loading={state.loadingFilterOptions}
                        disabled={state.loading}
                        onChange={(value: number) => {
                          handleFilterValueChange(value, filterIdx)
                        }}/>
                    }
                    <div class='flex' style={{ visibility: filterIdx !== 0 ? 'hidden' : '' }}>
                      <div
                        class='icon'
                        onClick={removeFilterItem}
                        style={{ visibility: state.filter.length < 2 ? 'hidden' : '' }}>
                        <i class="el-icon-remove"/>
                      </div>
                      <div
                        class='icon'
                        onClick={addFilterItem}
                        style={{ visibility: state.filter.length >= FILTER_VALUES.length ? 'hidden' : '' }}>
                        <i class="el-icon-circle-plus"/>
                      </div>
                    </div>
                  </div>
                )
              })
            }
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
            <p>4 - Select the value metric (radius size) in the <span class='metric-label'>purple</span> zone;</p>
            <p>5 - Apply the filters you desire.</p>
          </div>
        </div>
      )
    }

    const onPageChange = (newPage: number) => {
      state.pagination.currentPage = newPage
      $router.replace({ name: 'dashboard', query: { ...getQueryParams(), page: newPage.toString() } })
      handleAxisChange(state.options.xAxis)
    }

    const onPageSizeChange = (newSize: number) => {
      state.pagination.pageSize = newSize
      $router.replace({ name: 'dashboard', query: { ...getQueryParams(), pageSize: newSize.toString() } })
      handleAxisChange(state.options.xAxis)
    }

    const renderPagination = () => {
      return (
        <div class="block">
          <Pagination
            total={state.pagination.total}
            pageSize={state.pagination.pageSize}
            pageSizes={pageSizes}
            currentPage={state.pagination.currentPage}
            {...{ on: { 'update:currentPage': onPageChange } }}
            {...{ on: { 'update:pageSize': onPageSizeChange } }}
            layout='prev,pager,next,sizes'
          />
        </div>
      )
    }

    const renderScatterChart = () => {
      return (
        <div class='chart-container'>
          <DashboardScatterChart
            xAxis={state.xAxisValues}
            yAxis={state.yAxisValues}
            data={state.data}
            visualMap={state.visualMap}
          />
          {!state.loading && renderPagination()}
        </div>
      )
    }
    const renderHeatmapChart = () => {
      return (
        <div class='chart-container'>
          <DashboardHeatmapChart
            xAxis={state.xAxisValues}
            yAxis={state.yAxisValues}
            data={state.data}
            visualMap={state.visualMap}
          />
          {!state.loading && renderPagination()}
        </div>
      )
    }

    return () => {
      const showChart =
        ($route.query.xAxis && $route.query.yAxis && $route.query.agg)
        || (state.options.xAxis && state.options.yAxis && state.options.aggregation)
      const { selectedView } = state

      return (
        <div class='dashboard-container'>
          {renderFilters()}
          {renderVisualizations()}
          <div class='content-container'>
            {
              showChart
              && <div class='feature-box'>
                <ShareLink name='dashboard' query={getQueryParams()}/>
                <ChartSettings onColor={handleColormapChange}/>
              </div>
            }
            {!showChart && renderDashboardInstructions()}
            {showChart && selectedView === VIEW.SCATTER && renderScatterChart()}
            {showChart && selectedView === VIEW.HEATMAP && renderHeatmapChart()}
            {(state.loading || state.buildingChart)
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
