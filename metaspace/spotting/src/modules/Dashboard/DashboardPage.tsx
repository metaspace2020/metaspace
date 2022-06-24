import { defineComponent, onMounted, reactive } from '@vue/composition-api'
import './DashboardPage.scss'
import { Option, Select, Pagination, InputNumber, RadioGroup, RadioButton } from '../../lib/element-ui'
import { cloneDeep, groupBy, keyBy, maxBy, orderBy, uniq } from 'lodash-es'
import { DashboardScatterChart } from './DashboardScatterChart'
import { DashboardHeatmapChart } from './DashboardHeatmapChart'
import { ShareLink } from './ShareLink'
import { ChartSettings } from './ChartSettings'
import getColorScale from '../../lib/getColorScale'

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
    src: 'Polarity',
  },
  {
    label: 'Adducts',
    src: 'a',
  },
  {
    label: 'Neutral losses',
    src: 'nL',
  },
  {
    label: 'Matrix',
    src: 'Matrix short',
  },
  {
    label: 'Molecule',
    src: 'n',
  },
  {
    label: 'Technology',
    src: 'Technology',
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
    src: 'dsId',
  },
  {
    label: 'Lab',
    src: 'Participant lab',
  },
  {
    label: 'Ionisation source',
    src: 'Source Type',
  },
  {
    label: 'Mass analyser',
    src: 'Analyzer',
  },
  {
    label: 'Vacuum level',
    src: 'Source Pressure',
  },
]

const AGGREGATED_VALUES = [
  {
    label: 'Intensity',
    src: 'v',
  },
  {
    label: 'log10(Intensity)',
    src: 'v_log',
  },
]

const FILTER_VALUES = [
  {
    label: 'Polarity',
    src: 'Polarity',
  },
  {
    label: 'Adducts',
    src: 'a',
  },
  {
    label: 'Neutral losses',
    src: 'nL',
  },
  {
    label: 'Matrix',
    src: 'Matrix short',
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
    src: 'Technology',
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
    src: 'dsId',
  },
  {
    label: 'Lab',
    src: 'Participant lab',
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
  nL: 'nl',
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
      colormap: '-YlGnBu',
      filter: [cloneDeep(filterItem)],
      hiddenYValues: [],
      hiddenXValues: [],
      xAxisValues: [],
      yAxisValues: [],
      data: [],
      dataSource: 'EMBL',
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

    const initializeState = async() => {
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
        await handleAxisChange($route.query.xAxis, true, false)
      }
      if ($route.query.yAxis) {
        await handleAxisChange($route.query.yAxis, false, false)
      }
      if ($route.query.agg) {
        handleAggregationChange($route.query.agg, false)
      }
      if ($route.query.src) {
        handleDataSrcChange($route.query.src, false)
      }

      if ($route.query.filter) {
        const filterSrc : any[] = Array.isArray($route.query.filter)
          ? $route.query.filter : $route.query.filter.split(',')
        filterSrc.forEach((item: any, index: number) => {
          if (index > 0) {
            addFilterItem()
          }
          handleFilterSrcChange(item, index, false)
        })
      }

      if ($route.query.filterValue) {
        $route.query.filterValue.split('|').forEach((item: any, index: number) => {
          const value = ((state.filter[index].isBoolean || state.filter[index].isNumeric)
            ? item : item.split('#'))
          if (!Array.isArray(value) || (value.length > 0 && value[0])) {
            handleFilterValueChange(value, index, false)
          }
        })
      }
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation) {
        await loadData()
        buildValues()
      }
    }

    onMounted(() => {
      initializeState()
    })

    const buildFilterOptions = async(filterIndex: number) => {
      const filterSpec = FILTER_VALUES.find((filterItem: any) => filterItem.src
        === state.filter[filterIndex].src)
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
      state.filter[filterIndex].loadingFilterOptions = true

      const options = await loadFilterValues(state.filter[filterIndex].src)
      state.filter[filterIndex].options = uniq(options.map((item: any) => (item === null
        || item === undefined || item === 'null') ? 'None' : item)).sort()
      state.filter[filterIndex].loadingFilterOptions = false
    }

    const loadData = async() => {
      try {
        state.loading = true
        console.log('loading data')
        // load data
        const params : any = {
          predType: state.dataSource.toUpperCase(),
          xAxis: state.options.xAxis,
          yAxis: state.options.yAxis,
          loadPathway: Object.keys(PATHWAY_METRICS).includes(state.options.xAxis)
            || Object.keys(PATHWAY_METRICS).includes(state.options.yAxis),
          loadClass: Object.keys(CLASSIFICATION_METRICS).includes(state.options.xAxis)
            || Object.keys(CLASSIFICATION_METRICS).includes(state.options.yAxis),
          queryType: 'data',
          filter: (state.filter || []).map((item: any) => item.src).join(','),
          filterValues: (state.filter || []).map((item: any) => Array.isArray(item.value)
            ? item.value.join('#') : item.value).filter((x:any) => x).join('|'),
        }

        const query = Object.keys(params)
          .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
          .join('&')

        const baseUrl = 'https://sotnykje7gwzumke4nums4horm0gujac.lambda-url.eu-west-1.on.aws'
        const response = await fetch(baseUrl + '?' + query)
        state.usedData = await response.json()
      } catch (e) {
        state.usedData = {}
        state.data = []
      } finally {
        state.loading = false
      }
    }

    const loadFilterValues = async(filter:any) => {
      try {
        console.log('loading filter data')
        // load data
        const params : any = {
          predType: state.dataSource.toUpperCase(),
          xAxis: state.options.xAxis,
          yAxis: state.options.yAxis,
          loadPathway: Object.keys(PATHWAY_METRICS).includes(state.options.xAxis)
            || Object.keys(PATHWAY_METRICS).includes(state.options.yAxis),
          loadClass: Object.keys(CLASSIFICATION_METRICS).includes(state.options.xAxis)
            || Object.keys(CLASSIFICATION_METRICS).includes(state.options.yAxis),
          filter,
          queryType: 'filterValues',
        }

        const query = Object.keys(params)
          .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
          .join('&')

        const baseUrl = 'https://sotnykje7gwzumke4nums4horm0gujac.lambda-url.eu-west-1.on.aws'
        const response = await fetch(baseUrl + '?' + query)
        const filterJson = await response.json()
        return filterJson.values
      } catch (e) {
        return null
      }
    }

    const buildValues = async() => {
      try {
        const chartData = state.usedData
        const data = chartData.data
        const xAxisValues : string[] = chartData.xAxis
        let yAxisValues : string[] = chartData.yAxis

        yAxisValues = orderBy(yAxisValues, [axis => axis.toLowerCase()], ['desc'])

        const auxData : any = groupBy(data, state.options.xAxis)
        Object.keys(auxData).forEach((key: string) => {
          auxData[key] = keyBy(auxData[key], state.options.yAxis === 'coarse_class'
            ? 'class_full' : state.options.yAxis)
        })

        const dotValues : any = []
        const maxColormap : number = state.options.aggregation === 'v_log'
          ? Math.log10(100000) : 100000
        const yMaxValue : any = state.options.valueMetric === VALUE_METRICS.count.src // @ts-ignore
          ? maxBy(data, 'class_size')!.class_size // @ts-ignore
          : maxBy(data, 'fraction_detected')!.fraction_detected

        // build chart
        xAxisValues.forEach((xKey: any, xIndex: number) => {
          yAxisValues.forEach((yKey: any, yIndex: number) => {
            const isEmpty : any = auxData[xKey][yKey] === undefined
            const item : any = auxData[xKey][yKey] || {}
            let pointAggregation : any = isEmpty ? 0 : (state.options.aggregation === 'v_log' ? item.log
              : item.v)

            if (pointAggregation > maxColormap) {
              pointAggregation = maxColormap
            }

            const value : number = isEmpty ? 0 : (state.options.valueMetric === VALUE_METRICS.count.src
              ? item.class_size
              : item.fraction_detected)
            const normalizedValue = isEmpty ? 0 : (state.options.valueMetric === VALUE_METRICS.count.src
              ? (value / yMaxValue) : (yMaxValue === 0 ? 0 : (value / yMaxValue)))
            dotValues.push({
              value: [xIndex, yIndex, normalizedValue * 15, pointAggregation, value],
              label: {
                key: yKey,
                molecule: item.formulas ? item.formulas.split(',')[0] : undefined,
                x: xKey,
                y: yKey,
                datasetIds: item.dataset_ids ? item.dataset_ids.split(',') : undefined,
                formulas: item.formulas ? item.formulas.split(',') : undefined,
                matrix: item.matrixes ? item.matrixes.split(',') : undefined,
              },
            })
          })
        })

        state.visualMap = {
          type: state.options.aggregation !== 'coarse_class' ? 'continuous' : 'piecewise',
          show: true,
          calculable: true,
          dimension: 3,
          left: 'center',
          inRange: {
            color: getColorScale(state.colormap).range,
          },
          orient: 'horizontal',
          min: 0,
          max: maxColormap,
          formatter: function(value: any) {
            return value.toFixed(2)
          },
        }

        state.data = dotValues
        if (state.data.length === 0) {
          state.visualMap = { show: false }
        }

        state.pagination.total = xAxisValues.length
        state.xAxisValues = xAxisValues
        state.yAxisValues = yAxisValues

        state.buildingChart = false
        console.log('built')
      } catch (e) {
        console.log('e', e)
      } finally {
        state.loading = false
      }
    }

    const handleAggregationChange = (value: any, buildChart: boolean = true) => {
      state.options.aggregation = value
      $router.replace({ name: 'dashboard', query: { ...getQueryParams(), agg: value } })
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation && buildChart) {
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

    const handleFilterValueChange = async(value: any, idx : any = 0, buildChart: boolean = true) => {
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

      if (state.options.xAxis && state.options.yAxis && state.options.aggregation && buildChart) {
        await loadData()
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

    const handleColormapChange = (color: any) => {
      state.colormap = '-' + color.replace('-', '')
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation) {
        buildValues()
      }
    }

    const handleItemClick = (item: any) => { // get info from clicked chart item and open on a metaspace url
      const baseUrl = 'https://metaspace2020.eu/annotations?db_id=304'
      let url = baseUrl
      const formulas : string = item.data.label.formulas.join('|')
      const yAxisFilter : any = filterMap[state.options.yAxis]
      const xAxisFilter : any = filterMap[state.options.xAxis]
      if (yAxisFilter) {
        const value = (state.options.yAxis === 'fine_class' || state.options.yAxis === 'coarse_class'
          || state.options.yAxis === 'n' || state.options.yAxis === 'coarse_path'
          || state.options.yAxis === 'fine_path')
          ? formulas : (yAxisFilter.includes('matrix') ? item.data.label.matrix.join('|') : item.data.label.y)
        url += `&${yAxisFilter}=${encodeURIComponent(value)}`
      }
      if (xAxisFilter) {
        const value = (state.options.xAxis === 'fine_class' || state.options.xAxis === 'coarse_class'
          || state.options.xAxis === 'n' || state.options.xAxis === 'coarse_path'
          || state.options.xAxis === 'fine_path')
          ? formulas : (xAxisFilter.includes('matrix') ? item.data.label.matrix.join('|') : item.data.label.x)
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
        src: state.dataSource.toUpperCase(),
      }

      Object.keys(queryObj).forEach((key: string) => {
        if (!queryObj[key]) {
          delete queryObj[key]
        }
      })

      return queryObj
    }

    const handleDataSrcChange = async(text: any, buildChart: boolean = true) => {
      const changedValue = text !== state.dataSource
      state.dataSource = text.toUpperCase()
      $router.replace({ name: 'dashboard', query: { ...getQueryParams(), src: text } })

      if (state.options.xAxis && state.options.yAxis && changedValue) {
        state.filter = [cloneDeep(filterItem)]
      }
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation
        && changedValue && buildChart) {
        await loadData()
        await handleAxisChange(state.options.xAxis, true, false)
        await handleAxisChange(state.options.yAxis, false, false)
        await buildValues()
      }
    }

    const handleFilterSrcChange = (value: any, idx : any = 0, buildChart: boolean = true) => {
      const isNew = value !== state.filter[idx]?.src
      const shouldLoad = isNew && state.filter[idx]?.value
      state.filter[idx].src = value
      const filterSrcParams = state.filter.map((item: any) => item.src).join(',')
      $router.replace({ name: 'dashboard', query: { ...getQueryParams(), filter: filterSrcParams } })
      buildFilterOptions(idx)
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation && isNew) {
        handleFilterValueChange(null, idx, buildChart ? shouldLoad : false)
      }
    }

    const handleAxisChange = async(value: any, isXAxis : boolean = true, buildChart : boolean = true) => {
      const isNew : boolean = (isXAxis && value !== state.options.xAxis)
      || (!isXAxis && value !== state.options.yAxis)
      if (isXAxis) {
        state.options.xAxis = value
        $router.replace({ name: 'dashboard', query: { ...getQueryParams(), xAxis: value } })
      } else {
        state.options.yAxis = value
        $router.replace({ name: 'dashboard', query: { ...getQueryParams(), yAxis: value } })
      }
      if (state.options.xAxis && state.options.yAxis && isNew && buildChart) {
        await loadData()
      }
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation && buildChart && isNew) {
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
            <span class='filter-label mb-3'>Data source</span>
            <RadioGroup
              disabled={state.loading}
              value={state.dataSource}
              size="mini"
              onInput={async(text:any) => {
                handleDataSrcChange(text)
              }}>
              <RadioButton label='EMBL'/>
              <RadioButton label='ALL'/>
              <RadioButton label='INTERLAB'/>
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
                        loading={state.filter[filterIdx].loadingFilterOptions}
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
                        loading={state.filter[filterIdx].loadingFilterOptions}
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
    }

    const onPageSizeChange = (newSize: number) => {
      state.pagination.pageSize = newSize
      $router.replace({ name: 'dashboard', query: { ...getQueryParams(), pageSize: newSize.toString() } })
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

      // paginate data on client-side
      const yAxisValues : any[] = state.yAxisValues
      let xAxisValues : any[] = state.xAxisValues
      const total = xAxisValues.length
      const start = ((state.pagination.currentPage - 1) * state.pagination.pageSize)
      const end = ((state.pagination.currentPage - 1) * state.pagination.pageSize) + state.pagination.pageSize
      xAxisValues = xAxisValues.slice(start, end)
      const chartData = cloneDeep(state.data)
        .slice(yAxisValues.length * start, yAxisValues.length * end)
        .map((item: any) => {
          item.value[0] = item.value[0] - start // remove pages offset from chart values index
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
