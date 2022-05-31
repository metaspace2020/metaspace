import { defineComponent, onMounted, reactive } from '@vue/composition-api'
import './DashboardPage.scss'
import { Option, Select, Pagination, InputNumber, Button, RadioGroup, RadioButton } from '../../lib/element-ui'
import { cloneDeep, groupBy, keyBy, omit, orderBy, sortedUniq, uniq, uniqBy } from 'lodash-es'
import { DashboardScatterChart } from './DashboardScatterChart'
import { DashboardHeatmapChart } from './DashboardHeatmapChart'
import { ShareLink } from './ShareLink'
import { ChartSettings } from './ChartSettings'
// import { predictions } from '../../data/predictions'
import createColormap from '../../lib/createColormap'
import Vue from 'vue'

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
  rawDataInter: any
  usedData: any
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
  dataSource : any
  pathways : any
  wellmap : any
  pagination: any
  baseData: any
  hiddenYValues: any[]
  hiddenXValues: any[]
}

const VIEW = {
  SCATTER: 1,
  HEATMAP: 2,
}

const AXIS_VALUES = [
  {
    label: 'Polarity',
    src: 'pol',
  },
  {
    label: 'Adducts',
    src: 'a',
  },
  {
    label: 'Neutral losses',
    src: 'nl',
  },
  {
    label: 'Matrix',
    src: 'mS',
  },
  {
    label: 'Molecule',
    src: 'n',
  },
  {
    label: 'Technology',
    src: 't',
  },
  {
    label: 'Pathway',
    src: 'coarse_path',
  },
  {
    label: 'Pathway subclass',
    src: 'fine_path',
  },
  {
    label: 'Class',
    src: 'coarse_class',
  },
  {
    label: 'Subclass',
    src: 'fine_class',
  },
  {
    label: 'Dataset',
    src: 'd',
  },
  {
    label: 'Lab',
    src: 'lab',
  },
  {
    label: 'Ionisation source',
    src: 'sT',
  },
  {
    label: 'Mass analyser',
    src: 'an',
  },
  {
    label: 'Vacuum level',
    src: 'sP',
  },
]

const AGGREGATED_VALUES = [
  // {
  //   label: 'Prediction',
  //   src: 'pred_val',
  // },
  {
    label: 'Intensity',
    src: 'v',
  },
  {
    label: 'log10(Intensity)',
    src: 'v_log',
  },
  // {
  //   label: 'Simple count',
  //   src: 'p',
  // },
]

const FILTER_VALUES = [
  {
    label: 'Polarity',
    src: 'pol',
  },
  {
    label: 'Adducts',
    src: 'a',
  },
  {
    label: 'Neutral losses',
    src: 'nl',
  },
  {
    label: 'Matrix',
    src: 'mS',
  },
  {
    label: 'Value Prediction',
    src: 'pV',
    isNumeric: true,
  },
  {
    label: 'State Prediction',
    src: 'p',
    isBoolean: true,
  },
  {
    label: 'Technology',
    src: 't',
  },
  {
    label: 'Pathway class',
    src: 'coarse_path',
  },
  {
    label: 'Pathway subclass',
    src: 'fine_path',
  },
  {
    label: 'Class',
    src: 'coarse_class',
  },
  {
    label: 'Subclass',
    src: 'fine_class',
  },
  {
    label: 'Dataset',
    src: 'd',
  },
  {
    label: 'Lab',
    src: 'lab',
  },
  {
    label: 'Molecule',
    src: 'n',
  },
  {
    label: 'Formula',
    src: 'f',
  },
]

const CLASSIFICATION_METRICS = {
  fine_class: true,
  coarse_class: true,
}

const DATASET_METRICS = {
  pol: true,
  t: true,
  mS: true,
  lab: true,
  sT: true,
  an: true,
  sP: true,
}

const PREDICTION_METRICS = {
  a: true,
  d: true,
  f: true,
  nL: true,
  nS: true,
  nSI: true,
  pV: true,
  p: true,
  n: true,
}

const PATHWAY_METRICS = {
  fine_path: true,
  coarse_path: true,
}

const VALUE_METRICS = {
  count: {
    label: 'Count',
    src: 1,
  },
  average: {
    label: 'Fraction',
    src: 2,
  },
}

const filterMap : any = {
  a: 'add',
  coarse_class: 'q',
  fine_class: 'q',
  coarse_path: 'q',
  fine_path: 'q',
  n: 'q',
  d: 'ds',
  nl: 'nl',
  pol: 'mode',
  mS: 'matrix',
  t: 'matrix',
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
      hiddenYValues: [],
      hiddenXValues: [],
      xAxisValues: [],
      yAxisValues: [],
      data: [],
      dataSource: 'Interlab',
      rawData: undefined,
      rawDataInter: undefined,
      usedData: undefined,
      baseData: undefined,
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
        const baseUrl = 'https://sm-spotting-project.s3.eu-west-1.amazonaws.com/new/'
        const response = await fetch(baseUrl + 'matrix_predictions_24-05-22.json')
        const matrixPredictions = await response.json()
        const responseInterLab = await fetch(baseUrl + 'interlab_predictions_27-04-22.json')
        const interLabPredictions = await responseInterLab.json()
        const datasetResponse = await fetch(baseUrl + 'datasets_31-05-22.json')
        const datasets = await datasetResponse.json()
        const chemClassResponse = await fetch(baseUrl + 'custom_classification_14-03-22.json')
        state.classification = await chemClassResponse.json()
        const pathwayResponse = await fetch(baseUrl + 'pathways_14-03-22.json')
        state.pathways = await pathwayResponse.json()

        const datasetsById = keyBy(datasets, 'Dataset ID')
        delete datasetsById.null
        const predWithDs : any = []
        matrixPredictions.forEach((prediction: any) => {
          const datasetItem = datasetsById[prediction.dsId]
          if (datasetItem) {
            predWithDs.push({
              pol: datasetItem.Polarity,
              mS: datasetItem['Matrix short'],
              mL: datasetItem['Matrix long'],
              t: datasetItem.nology,
              lab: datasetItem['Participant lab'],
              sT: datasetItem['Source Type'],
              sP: datasetItem['Source Pressure'],
              an: datasetItem.Analyzer,
              d: prediction.dsId,
              f: prediction.f,
              a: prediction.a,
              nl: prediction.nL,
              n: prediction.name,
              pV: prediction.pV,
              p: prediction.p,
              v: prediction.v,
            })
          }
        })
        const predWithDsInter : any = []
        interLabPredictions.forEach((prediction: any) => {
          const datasetItem = datasetsById[prediction.dsId]
          if (datasetItem) {
            predWithDsInter.push({
              pol: datasetItem.Polarity,
              mS: datasetItem['Matrix short'],
              mL: datasetItem['Matrix long'],
              t: datasetItem.nology,
              lab: datasetItem['Participant lab'],
              sT: datasetItem['Source Type'],
              sP: datasetItem['Source Pressure'],
              an: datasetItem.Analyzer,
              d: prediction.dsId,
              f: prediction.f,
              a: prediction.a,
              nl: prediction.nL,
              n: prediction.name,
              pV: prediction.pV,
              p: prediction.p,
              v: prediction.v,
            })
          }
        })
        console.log('File loaded')
        // console.log('File loaded', predWithDs)
        // console.log('File loaded inter', predWithDsInter)
        state.rawData = predWithDs
        state.rawDataInter = predWithDsInter
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
        const filterSrc : any[] = Array.isArray($route.query.filter)
          ? $route.query.filter : $route.query.filter.split(',')
        filterSrc.forEach((item: any, index: number) => {
          if (index > 0) {
            addFilterItem()
          }
          handleFilterSrcChange(item, index)
        })
      }

      if ($route.query.filterValue) {
        $route.query.filterValue.split('|').forEach((item: any, index: number) => {
          const value = ((state.filter[index].isBoolean || state.filter[index].isNumeric)
            ? item : item.split('#'))
          handleFilterValueChange(value, index)
        })
      }

      buildValues()
    })

    const buildFilterOptions = (filter: any, filterIndex: number, data: any[]) => {
      const filterSpec = FILTER_VALUES.find((filterItem: any) => filterItem.src === filter.src)
      if (filterSpec && filterSpec?.isNumeric) {
        state.filter[filterIndex].isNumeric = true
        state.filter[filterIndex].isBoolean = false
        return
      } else if (filterSpec && filterSpec?.isBoolean) {
        state.filter[filterIndex].isNumeric = false
        state.filter[filterIndex].isBoolean = true
      } else {
        state.filter[filterIndex].isNumeric = false
        state.filter[filterIndex].isBoolean = false
      }
      state.loadingFilterOptions = true

      state.filter[filterIndex].options = uniq(data.map((item: any) => (item[filter.src] === null
        || item[filter.src] === undefined || item[filter.src] === 'null') ? 'None' : item[filter.src])).sort()
      state.loadingFilterOptions = false
    }

    const buildValues = () => {
      if (state.buildingChart) {
        return
      }
      console.log('building')

      let auxData : any = null
      let filteredData : any = state.usedData
      let min : number = 0
      let max : number = 0
      const maxColormap : number = 100000
      state.buildingChart = true

      state.filter.forEach((filter: any, filterIndex: number) => {
        if (filter.src && !filter.value) {
          buildFilterOptions(filter, filterIndex, filteredData)
        } else if (filter.src && filter.value) {
          filteredData = filteredData.filter((data: any) => {
            const filterValue = Array.isArray(filter.value) && filter.value.includes('None')
              ? filter.value.concat(['null', null, undefined, 'nan', 'Nan', 'None', 'none'])
              : filter.value
            return filter.isNumeric ? parseFloat(data[filter.src]) <= parseFloat(filter.value)
              : (filter.isBoolean ? (filterValue === 'True'
                ? (data[filter.src] === 2) : data[filter.src] !== 2) // pred threestate
                : (filterValue.length === 0 || filterValue.includes(data[filter.src])))
          })
        }
      })

      auxData = groupBy(filteredData, state.options.xAxis)
      let maxValue : number = 1
      Object.keys(auxData).forEach((key: string) => {
        if (state.options.yAxis === 'coarse_class') {
          auxData[key] = groupBy(auxData[key], (item: any) => {
            return item.coarse_class + ' -agg- ' + item.fine_class
          })
        } else {
          auxData[key] = groupBy(auxData[key], state.options.yAxis)
        }
        Object.keys(auxData[key]).forEach((yKey: any) => {
          if (auxData[key][yKey].length > maxValue && state.xAxisValues.includes(key)) {
            maxValue = auxData[key][yKey].length
          }
        })
      })

      const dotValues : any = []
      let availableAggregations : any = []
      const xEmptyCounter : any = {}
      const yEmptyCounter : any = {}

      state.xAxisValues.forEach((xKey: any, xIndex: number) => {
        state.yAxisValues.forEach((yKey: any, yIndex: number) => {
          if (!(auxData[xKey] && auxData[xKey][yKey])) {
            if (xEmptyCounter[xKey] === undefined) {
              xEmptyCounter[xKey] = 0
            }
            if (yEmptyCounter[yKey] === undefined) {
              yEmptyCounter[yKey] = 0
            }
            xEmptyCounter[xKey] += 1
            yEmptyCounter[yKey] += 1
          }
        })
      })

      const toBeRemoved : any[] = []
      const toBeRemovedX : any[] = []
      const yAxisIdxMap : any = {}
      const xAxisIdxMap : any = {}
      let counter = 0
      state.yAxisValues.forEach((yAxis: any) => {
        if (yEmptyCounter[yAxis] === state.xAxisValues.length) {
          toBeRemoved.push(yAxis)
        } else {
          yAxisIdxMap[yAxis] = counter
          counter += 1
        }
      })
      counter = 0
      state.xAxisValues.forEach((xAxis: any) => {
        if (xEmptyCounter[xAxis] === state.yAxisValues.length) {
          toBeRemovedX.push(xAxis)
        } else {
          xAxisIdxMap[xAxis] = counter
          counter += 1
        }
      })

      state.hiddenYValues = toBeRemoved
      state.hiddenXValues = toBeRemovedX

      state.xAxisValues.forEach((xKey: any) => {
        let yMaxValue : number = 0

        if (auxData[xKey] && state.options.valueMetric === VALUE_METRICS.average.src) {
          Object.keys(auxData[xKey]).forEach((metricKey: string) => {
            const auxAgg : any = groupBy(auxData[xKey][metricKey], 'p') // pred_threestate
            const detected : any = uniq((auxAgg[2] || []).map((item:any) => item.n))
            const nonDetected : any = uniq((auxAgg[0] || []).concat(auxAgg[1] || [])
              .map((item:any) => item.n)).filter((item: any) => !detected.includes(item))
            const totalAuxAgg : number = (detected.length
              + nonDetected.length) || 1
            const countAuxAgg : number = detected.length
            if (totalAuxAgg && ((countAuxAgg / totalAuxAgg) > yMaxValue)) {
              yMaxValue = countAuxAgg / totalAuxAgg
            }
          })
        }

        state.yAxisValues.forEach((yKey: any) => {
          if (auxData[xKey] && auxData[xKey][yKey]) {
            const label = state.options.aggregation === 'v_log' ? 'v'
              : state.options.aggregation
            const molecules : any = groupBy(auxData[xKey][yKey], 'n')
            const moleculeAggregation : any = []
            Object.keys(molecules).forEach((key: string) => {
              let prediction = false
              let intensity = 0
              molecules[key].forEach((molecule: any) => {
                intensity += molecule[label]
                if (molecule.p === 2) {
                  prediction = true
                }
              })
              moleculeAggregation.push({
                name: key,
                [state.options.xAxis]: xKey,
                [state.options.yAxis]: yKey,
                prediction,
                intensity: (state.options.aggregation === 'v_log' ? Math.log10(intensity + 1)
                  : intensity),
              })
            })

            const detected : any = uniq(moleculeAggregation.filter((molecule: any) => molecule.prediction))
            const nonDetected : any = uniq(moleculeAggregation.filter((molecule: any) => !molecule.prediction))
            const totalCount : number = (detected.length
              + nonDetected.length) || 1
            const classSize : number = totalCount
            const sum = moleculeAggregation.map((item: any) => item.intensity).reduce((a:any, b:any) => a + b, 0)
            let pointAggregation : any = (sum / classSize) || 0 // mean

            if (state.options.aggregation === 'v_log' && pointAggregation > Math.log10(maxColormap)) { // set max
              pointAggregation = Math.log10(maxColormap)
            } else if (state.options.aggregation !== 'v_log' && pointAggregation > maxColormap) {
              pointAggregation = maxColormap
            }

            availableAggregations.push(pointAggregation)

            const value : number = state.options.valueMetric === VALUE_METRICS.count.src ? auxData[xKey][yKey].length
              : (detected.length / totalCount)
            const normalizedValue = state.options.valueMetric === VALUE_METRICS.count.src
              ? (value / maxValue) : (yMaxValue === 0 ? 0 : (value / yMaxValue))

            dotValues.push({
              value: [xAxisIdxMap[xKey], yAxisIdxMap[yKey], normalizedValue * 15, pointAggregation, value],
              label: {
                key: yKey,
                molecule: auxData[xKey][yKey][0].f,
                x: xKey,
                y: yKey,
                datasetIds: uniq(auxData[xKey][yKey].map((item:any) => item.d)),
                formulas: uniq(auxData[xKey][yKey].map((item:any) => item.f)),
                matrix: auxData[xKey][yKey][0].mL,
              },
            })
          }
        })
      })

      let colormap : any = state.colormap
      let colorSteps : number = 1
      const colors : any = []

      if (!Array.isArray(colormap)) {
        colormap = createColormap('-YlGnBu').map((color: any) => {
          return `rgba(${color.join(',')})`
        })
      }

      availableAggregations = uniq(availableAggregations).sort()
      availableAggregations = availableAggregations
        .filter((agg:any) => agg !== null && agg !== undefined && agg !== 'undefined' && agg !== 'null')
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
        calculable: true,
        dimension: 3,
        left: 'center',
        inRange: {
          color: colors,
        },
        orient: 'horizontal',
        min: 0,
        max: 1,
        formatter: function(value: any) {
          return value.toFixed(2)
        },
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
      console.log('built')
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
      if (parseInt(value, 10) === 0 || parseInt(value, 10) === 1) {
        return 'False'
      } else {
        return 'True'
      }
    }

    const handleFilterValueChange = (value: any, idx : any = 0) => {
      state.filter[idx].value = value
      const filterValueParams = state.filter.map((item: any) => Array.isArray(item.value)
        ? item.value.join('#') : item.value).join('|')

      $router.replace({
        name: 'dashboard',
        query: {
          ...getQueryParams(),
          filterValue: filterValueParams,
        },
      })

      if (state.options.xAxis && state.options.yAxis && state.options.aggregation) {
        buildValues()
      }
    }

    const removeFilterItem = () => {
      const value = state.filter[state.filter.length - 1].value
      state.filter.pop()
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation && value) {
        buildValues()
      }
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

    const handleItemClick = (item: any) => {
      const baseUrl = 'https://metaspace2020.eu/annotations?db_id=304'
      let url = baseUrl // + item.data.label.datasetIds.join(',')
      const formulas : string = item.data.label.formulas.join('|')
      const yAxisFilter : any = filterMap[state.options.yAxis]
      const xAxisFilter : any = filterMap[state.options.xAxis]
      if (yAxisFilter) {
        const value = (state.options.yAxis === 'fine_class' || state.options.yAxis === 'coarse_class'
          || state.options.yAxis === 'n' || state.options.yAxis === 'coarse_path'
          || state.options.yAxis === 'fine_path')
          ? formulas : (yAxisFilter.includes('matrix') ? item.data.label.matrix : item.data.label.y)
        url += `&${yAxisFilter}=${encodeURIComponent(value)}`
      }
      if (xAxisFilter) {
        const value = (state.options.xAxis === 'fine_class' || state.options.xAxis === 'coarse_class'
          || state.options.xAxis === 'n' || state.options.xAxis === 'coarse_path'
          || state.options.xAxis === 'fine_path')
          ? formulas : (xAxisFilter.includes('matrix') ? item.data.label.matrix : item.data.label.x)
        url += `&${xAxisFilter}=${encodeURIComponent(value)}`
      }
      window.open(url, '_blank')
    }

    const getQueryParams = () => {
      const queryObj : any = {
        filter: state.filter.map((item: any) => item.src).join(','),
        filterValue: state.filter.map((item: any) => Array.isArray(item.value)
          ? item.value.join('#') : item.value).join('|'),
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
      const isNew = value !== state.filter[idx]?.src
      state.filter[idx].src = value
      const filterSrcParams = state.filter.map((item: any) => item.src).join(',')
      $router.replace({ name: 'dashboard', query: { ...getQueryParams(), filter: filterSrcParams } })
      buildFilterOptions(state.filter[idx], idx, state.usedData)
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation && isNew) {
        handleFilterValueChange(null, idx)
      }
    }

    const handleAxisChange = (value: any, isXAxis : boolean = true, buildChart : boolean = true) => {
      let axis : any = []
      let src : any
      const isNew : boolean = (isXAxis && value !== state.options.xAxis)
      || (!isXAxis && value !== state.options.yAxis)
      if (isXAxis) {
        state.options.xAxis = value
        $router.replace({ name: 'dashboard', query: { ...getQueryParams(), xAxis: value } })
      } else {
        state.options.yAxis = value
        $router.replace({ name: 'dashboard', query: { ...getQueryParams(), yAxis: value } })
      }

      if (Object.keys(CLASSIFICATION_METRICS).includes(value)) {
        src = state.classification
      } else if (Object.keys(PREDICTION_METRICS).includes(value) || Object.keys(DATASET_METRICS).includes(value)) {
        src = state.dataSource === 'Matrix' ? state.rawData : state.rawDataInter
      } else if (Object.keys(PATHWAY_METRICS).includes(value)) {
        src = state.pathways
      }

      if (!src) {
        return
      }

      src.forEach((row: any) => {
        if (!axis.includes(row[value])) {
          let auxValue = row[value]
          if (!isXAxis && value === 'coarse_class') {
            auxValue += ` -agg- ${row.fine_class}`
          }
          axis.push(auxValue)
        }
      })

      axis = uniq(axis)
      axis.sort((a:string, b:string) => {
        if (a > b) {
          return -1
        }
        if (b > a) {
          return 1
        }
        return 0
      })
      axis = axis.filter((item: any) => item && item !== 'null' && item !== 'none' && item !== 'undefined')
      if (isXAxis) {
        state.pagination.total = axis.length
        state.xAxisValues = axis
      } else {
        state.yAxisValues = axis
      }

      if (state.options.xAxis && state.options.yAxis && isNew) {
        setUsedData()
      }

      if (state.options.xAxis && state.options.yAxis && state.options.aggregation && buildChart) {
        buildValues()
      }
    }

    const setUsedData = (source:string = state.dataSource) => {
      let mergedData : any = source === 'Matrix' ? state.rawData : state.rawDataInter
      if (
        Object.keys(CLASSIFICATION_METRICS).includes(state.options.xAxis)
        || Object.keys(CLASSIFICATION_METRICS).includes(state.options.yAxis)
      ) {
        const predWithClass : any = []
        const chemClassById = groupBy(state.classification, 'name_short')
        mergedData.forEach((prediction: any) => {
          if (chemClassById[prediction.n]) {
            chemClassById[prediction.n].forEach((classification: any) => {
              predWithClass.push({ ...classification, ...prediction })
            })
          }
        })
        mergedData = predWithClass
      } else if (
        Object.keys(PATHWAY_METRICS).includes(state.options.xAxis)
        || Object.keys(PATHWAY_METRICS).includes(state.options.yAxis)) {
        const predWithClass : any = []
        const chemClassById = groupBy(state.pathways, 'name_short')
        mergedData.forEach((prediction: any) => {
          if (chemClassById[prediction.n]) {
            chemClassById[prediction.n].forEach((classification: any) => {
              predWithClass.push({ ...classification, ...prediction })
            })
          }
        })
        mergedData = predWithClass
      }
      state.usedData = mergedData
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
            <span class='filter-label mb-3'>Data source</span>
            <RadioGroup
              disabled={state.loading}
              value={state.dataSource}
              size="mini"
              onInput={(text:any) => {
                const changedValue = text !== state.dataSource
                state.dataSource = text
                Vue.nextTick()
                state.loading = true
                if (state.options.xAxis && state.options.yAxis && changedValue) {
                  setUsedData(text)
                  state.filter = [cloneDeep(filterItem)]
                }
                if (state.options.xAxis && state.options.yAxis && state.options.aggregation
                && changedValue) {
                  handleAxisChange(state.options.xAxis, true, false)
                  handleAxisChange(state.options.yAxis, false, false)
                  buildValues()
                }
                state.loading = false
              }}>
              <RadioButton label='Matrix'/>
              <RadioButton label='Interlab'/>
            </RadioGroup>

          </div>
          <div class='filter-box m-2'>
            <span class='filter-label mb-2'>Filters</span>
            {
              state.filter.map((filter: any, filterIdx: number) => {
                return (
                  <div class='flex flex-wrap justify-center'>
                    <Select
                      class='select-box-mini mr-2'
                      value={filter.src}
                      onChange={(value: number) => {
                        handleFilterSrcChange(value, filterIdx)
                      }}
                      disabled={state.loading || state.usedData === undefined}
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
                        value={filter.value}
                        loading={state.loadingFilterOptions}
                        filterable
                        clearable
                        multiple={!filter.isBoolean}
                        noDataText='No data'
                        onChange={(value: number) => {
                          handleFilterValueChange(value, filterIdx)
                        }}
                        disabled={state.loading}
                        placeholder='Adduct'
                        size='mini'>
                        {
                          (filter.isBoolean ? ['False', 'True'] : filter.options).map((option: any) => {
                            return <Option
                              label={option}
                              value={option}/>
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
        <div class='visualization-container flex w-full justify-end'>
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

    const renderPagination = (total: number) => {
      return (
        <div class="block">
          <Pagination
            total={total}
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

    const renderScatterChart = (yAxisValues: any, xAxisValues: any, total: number, chartData : any) => {
      return (
        <div class='chart-container'>
          <DashboardScatterChart
            xAxis={xAxisValues}
            yAxis={yAxisValues}
            size={yAxisValues.length * 30}
            data={chartData}
            visualMap={state.visualMap}
            onItemSelected={handleItemClick}
          />
          {!state.loading && renderPagination(total)}
        </div>
      )
    }
    const renderHeatmapChart = (yAxisValues: any, xAxisValues: any, total: number, chartData : any) => {
      return (
        <div class='chart-container'>
          <DashboardHeatmapChart
            xAxis={xAxisValues}
            yAxis={yAxisValues}
            size={yAxisValues.length * 30}
            data={chartData}
            visualMap={state.visualMap}
          />
          {!state.loading && renderPagination(total)}
        </div>
      )
    }

    return () => {
      const showChart =
        ($route.query.xAxis && $route.query.yAxis && $route.query.agg)
        || (state.options.xAxis && state.options.yAxis && state.options.aggregation)
      const { selectedView } = state
      const isLoading = (state.loading || state.buildingChart)
      const yAxisValues : any[] = state.yAxisValues.filter((item: any) => !state.hiddenYValues.includes(item))
      let xAxisValues : any[] = state.xAxisValues.filter((item: any) => !state.hiddenXValues.includes(item))
      const total = xAxisValues.length
      const start = ((state.pagination.currentPage - 1) * state.pagination.pageSize)
      const end = ((state.pagination.currentPage - 1) * state.pagination.pageSize) + state.pagination.pageSize
      xAxisValues = xAxisValues.slice(start, end)
      const chartData = state.data.slice(yAxisValues.length * start, yAxisValues.length * end).map((item: any) => {
        item.value[0] = item.value[0] - start
        return item
      })

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
            {
              !isLoading && showChart && selectedView === VIEW.SCATTER
              && renderScatterChart(yAxisValues, xAxisValues, total, chartData)
            }
            {
              !isLoading && showChart && selectedView === VIEW.HEATMAP
              && renderHeatmapChart(yAxisValues, xAxisValues, total, chartData)
            }
            {
              isLoading
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
