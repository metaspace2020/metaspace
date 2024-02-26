import { computed, defineComponent, onMounted, reactive } from 'vue'
import {
  ElOption,
  ElSelect,
  ElPagination,
  ElRadioGroup,
  ElRadioButton,
  ElTooltip,
  ElButton,
  ElIcon,
} from '../../lib/element-plus'
import { cloneDeep, flatten, groupBy, keyBy, maxBy, orderBy, uniq } from 'lodash-es'
import { DashboardScatterChart } from './DashboardScatterChart'
import { DashboardHeatmapChart } from './DashboardHeatmapChart'
import { ShareLink } from './ShareLink'
import { ChartSettings } from './ChartSettings'
import getColorScale from '../../lib/getColorScale'
import ScatterChart from '../../assets/inline/scatter_chart.svg'
import SortDropdown from '../../components/SortDropdown/SortDropdown'
import './DashboardPage.scss'
import { useQuery } from '@vue/apollo-composable'
import { getDetectabilitySourcesQuery } from '../../api/group'
import { currentUserWithGroupDetectabilityQuery } from '../../api/user'
import { CirclePlusFilled, Grid, InfoFilled, Loading, QuestionFilled, RemoveFilled } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'

interface Options {
  xAxis: any
  yAxis: any
  aggregation: any
  valueMetric: any
}

interface DashboardState {
  orderBy: string
  firstGenerated: boolean
  sortingOrder: string
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
  isEmpty: boolean
  buildingChart: boolean
  predictions: any
  datasets: any
  classification: any
  dataSource: any
  pathways: any
  wellmap: any
  pagination: any
  baseData: any
  hiddenYValues: any[]
  hiddenXValues: any[]
}

const VIEW = {
  SCATTER: 1,
  HEATMAP: 2,
}

const FILTER_DISABLED_COMBINATIONS: any = {
  main_coarse_class: ['coarse_class', 'fine_class'],
  coarse_class: ['main_coarse_class'],
  fine_class: ['main_coarse_class'],
  main_coarse_path: ['coarse_path', 'fine_path'],
  coarse_path: ['main_coarse_path'],
  fine_path: ['main_coarse_path'],
}

const ALLOWED_COMBINATIONS: any = {
  EMBL: {
    Adducts: [
      'Chemical class',
      'Dataset id',
      'Sample name',
      'MALDI matrix',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Polarity',
      'Chemical subclass',
    ],
    'Chemical class': ['Adducts', 'Dataset id', 'Sample name', 'MALDI matrix', 'Neutral losses', 'Polarity'],
    'Dataset id': [
      'Adducts',
      'Chemical class',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'Sample name': [
      'Adducts',
      'Chemical class',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'MALDI matrix': [
      'Adducts',
      'Chemical class',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Polarity',
      'Chemical subclass',
    ],
    Molecule: ['Adducts', 'Dataset id', 'Sample name', 'MALDI matrix', 'Neutral losses', 'Polarity'],
    'Neutral losses': [
      'Adducts',
      'Chemical class',
      'Dataset id',
      'Sample name',
      'MALDI matrix',
      'Molecule',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Polarity',
      'Chemical subclass',
    ],
    'Metabolic pathway group': ['Adducts', 'Dataset id', 'Sample name', 'MALDI matrix', 'Neutral losses', 'Polarity'],
    'Metabolic pathway': ['Adducts', 'Dataset id', 'Sample name', 'MALDI matrix', 'Neutral losses', 'Polarity'],
    Polarity: [
      'Adducts',
      'Chemical class',
      'MALDI matrix',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'Chemical subclass': ['Adducts', 'Dataset id', 'Sample name', 'MALDI matrix', 'Neutral losses', 'Polarity'],
    'Ionisation source': [
      'Adducts',
      'Chemical class',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    Lab: [
      'Adducts',
      'Chemical class',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'Mass analyser': [
      'Adducts',
      'Chemical class',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'Source Pressure': ['Adducts', 'Neutral losses'],
    Technology: [
      'Adducts',
      'Chemical class',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
  },
  ALL: {
    Adducts: [
      'Chemical class',
      'Dataset id',
      'Sample name',
      'Ionisation source',
      'Lab',
      'Mass analyser',
      'MALDI matrix',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Polarity',
      'Chemical subclass',
      'Technology',
      'Source Pressure',
    ],
    'Chemical class': [
      'Adducts',
      'Dataset id',
      'Sample name',
      'Ionisation source',
      'Lab',
      'Mass analyser',
      'MALDI matrix',
      'Neutral losses',
      'Polarity',
      'Technology',
    ],
    'Dataset id': [
      'Adducts',
      'Chemical class',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'Sample name': [
      'Adducts',
      'Chemical class',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'Ionisation source': [
      'Adducts',
      'Chemical class',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    Lab: [
      'Adducts',
      'Chemical class',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'Mass analyser': [
      'Adducts',
      'Chemical class',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'MALDI matrix': [
      'Adducts',
      'Chemical class',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Polarity',
      'Chemical subclass',
    ],
    Molecule: ['Adducts', 'Dataset id', 'Sample name', 'Lab', 'MALDI matrix', 'Neutral losses'],
    'Neutral losses': [
      'Adducts',
      'Chemical class',
      'Dataset id',
      'Sample name',
      'Ionisation source',
      'Lab',
      'Mass analyser',
      'MALDI matrix',
      'Molecule',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Polarity',
      'Chemical subclass',
      'Technology',
      'Source Pressure',
    ],
    'Metabolic pathway group': [
      'Adducts',
      'Dataset id',
      'Sample name',
      'Ionisation source',
      'Lab',
      'Mass analyser',
      'MALDI matrix',
      'Neutral losses',
      'Polarity',
      'Technology',
    ],
    'Metabolic pathway': [
      'Adducts',
      'Dataset id',
      'Sample name',
      'Ionisation source',
      'Lab',
      'Mass analyser',
      'MALDI matrix',
      'Neutral losses',
      'Polarity',
      'Technology',
    ],
    Polarity: [
      'Adducts',
      'Chemical class',
      'MALDI matrix',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'Chemical subclass': [
      'Adducts',
      'Dataset id',
      'Sample name',
      'Ionisation source',
      'Lab',
      'Mass analyser',
      'MALDI matrix',
      'Neutral losses',
      'Polarity',
      'Technology',
    ],
    Technology: [
      'Adducts',
      'Chemical class',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'Source Pressure': ['Adducts', 'Neutral losses'],
  },
  INTERLAB: {
    Adducts: [
      'Chemical class',
      'Dataset id',
      'Sample name',
      'Ionisation source',
      'Lab',
      'Mass analyser',
      'MALDI matrix',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Polarity',
      'Chemical subclass',
      'Technology',
      'Source Pressure',
    ],
    'Chemical class': [
      'Adducts',
      'Dataset id',
      'Sample name',
      'Ionisation source',
      'Lab',
      'Mass analyser',
      'MALDI matrix',
      'Neutral losses',
      'Polarity',
      'Technology',
    ],
    'Dataset id': [
      'Adducts',
      'Chemical class',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'Sample name': [
      'Adducts',
      'Chemical class',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'Ionisation source': [
      'Adducts',
      'Chemical class',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    Lab: [
      'Adducts',
      'Chemical class',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'Mass analyser': [
      'Adducts',
      'Chemical class',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'MALDI matrix': [
      'Adducts',
      'Chemical class',
      'Molecule',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Polarity',
      'Chemical subclass',
    ],
    Molecule: ['Adducts', 'Dataset id', 'Sample name', 'Lab', 'MALDI matrix', 'Neutral losses'],
    'Neutral losses': [
      'Adducts',
      'Chemical class',
      'Dataset id',
      'Sample name',
      'Ionisation source',
      'Lab',
      'Mass analyser',
      'MALDI matrix',
      'Molecule',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Polarity',
      'Chemical subclass',
      'Technology',
      'Source Pressure',
    ],
    'Metabolic pathway group': [
      'Adducts',
      'Dataset id',
      'Sample name',
      'Ionisation source',
      'Lab',
      'Mass analyser',
      'MALDI matrix',
      'Neutral losses',
      'Polarity',
      'Technology',
    ],
    'Metabolic pathway': [
      'Adducts',
      'Dataset id',
      'Sample name',
      'Ionisation source',
      'Lab',
      'Mass analyser',
      'MALDI matrix',
      'Neutral losses',
      'Polarity',
      'Technology',
    ],
    Polarity: [
      'Adducts',
      'Chemical class',
      'MALDI matrix',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'Chemical subclass': [
      'Adducts',
      'Dataset id',
      'Sample name',
      'Ionisation source',
      'Lab',
      'Mass analyser',
      'MALDI matrix',
      'Neutral losses',
      'Polarity',
      'Technology',
    ],
    Technology: [
      'Adducts',
      'Chemical class',
      'Neutral losses',
      'Metabolic pathway group',
      'Metabolic pathway',
      'Chemical subclass',
    ],
    'Source Pressure': ['Adducts', 'Neutral losses'],
  },
}

const AXIS_VALUES: any = {
  EMBL: [
    {
      label: 'Adducts',
      src: 'a',
    },
    {
      label: 'Chemical class',
      src: 'main_coarse_class',
    },
    {
      label: 'Dataset id',
      src: 'dsId',
    },
    {
      label: 'Sample name',
      src: 'Sample name',
    },
    {
      label: 'MALDI matrix',
      src: 'Matrix short',
    },
    {
      label: 'Molecule',
      src: 'name',
    },
    {
      label: 'Neutral losses',
      src: 'nL',
    },
    {
      label: 'Metabolic pathway group',
      src: 'main_coarse_path',
    },
    {
      label: 'Metabolic pathway',
      src: 'fine_path',
    },
    {
      label: 'Polarity',
      src: 'Polarity',
    },
    {
      label: 'Chemical subclass',
      src: 'fine_class',
    },
    {
      label: 'Lab',
      src: 'Participant lab',
    },
    {
      label: 'Ionisation source',
      src: 'Ionisation source',
    },
    {
      label: 'Mass analyser',
      src: 'Mass analyser',
    },
    {
      label: 'Source Pressure',
      src: 'Source pressure',
    },
    {
      label: 'Technology',
      src: 'Technology',
    },
  ],
  ALL: [
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
      label: 'MALDI matrix',
      src: 'Matrix short',
    },
    {
      label: 'Molecule',
      src: 'name',
    },
    {
      label: 'Technology',
      src: 'Technology',
    },
    {
      label: 'Metabolic pathway group',
      src: 'main_coarse_path',
    },
    {
      label: 'Metabolic pathway',
      src: 'fine_path',
    },
    {
      label: 'Chemical class',
      src: 'main_coarse_class',
    },
    {
      label: 'Chemical subclass',
      src: 'fine_class',
    },
    {
      label: 'Dataset id',
      src: 'dsId',
    },
    {
      label: 'Sample name',
      src: 'Sample name',
    },
    {
      label: 'Lab',
      src: 'Participant lab',
    },
    {
      label: 'Ionisation source',
      src: 'Ionisation source',
    },
    {
      label: 'Mass analyser',
      src: 'Mass analyser',
    },
    {
      label: 'Source Pressure',
      src: 'Source pressure',
    },
  ],
  INTERLAB: [
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
      label: 'MALDI matrix',
      src: 'Matrix short',
    },
    {
      label: 'Molecule',
      src: 'name',
    },
    {
      label: 'Technology',
      src: 'Technology',
    },
    {
      label: 'Metabolic pathway group',
      src: 'main_coarse_path',
    },
    {
      label: 'Metabolic pathway',
      src: 'fine_path',
    },
    {
      label: 'Chemical class',
      src: 'main_coarse_class',
    },
    {
      label: 'Chemical subclass',
      src: 'fine_class',
    },
    {
      label: 'Dataset id',
      src: 'dsId',
    },
    {
      label: 'Sample name',
      src: 'Sample name',
    },
    {
      label: 'Lab',
      src: 'Participant lab',
    },
    {
      label: 'Ionisation source',
      src: 'Ionisation source',
    },
    {
      label: 'Mass analyser',
      src: 'Mass analyser',
    },
    {
      label: 'Source Pressure',
      src: 'Source pressure',
    },
  ],
}

const AGGREGATED_VALUES: any = {
  EMBL: [
    {
      label: 'Intensity',
      src: 'effective_intensity',
    },
    {
      label: 'log10(Intensity)',
      src: 'log10_intensity',
    },
  ],
  ALL: [
    {
      label: 'TIC normalised intensity',
      src: 'tic',
    },
    {
      label: 'Fraction detected',
      src: 'fraction_detected',
    },
  ],
  INTERLAB: [
    {
      label: 'TIC normalised intensity',
      src: 'tic',
    },
    {
      label: 'Fraction detected',
      src: 'fraction_detected',
    },
  ],
}

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
    label: 'MALDI matrix',
    src: 'Matrix short',
  },
  {
    label: 'Technology',
    src: 'Technology',
  },
  {
    label: 'Metabolic pathway group',
    src: 'main_coarse_path',
  },
  {
    label: 'Metabolic pathway group',
    src: 'coarse_path',
  },
  {
    label: 'Metabolic pathway',
    src: 'fine_path',
  },
  {
    label: 'Chemical class',
    src: 'main_coarse_class',
  },
  {
    label: 'Chemical class',
    src: 'coarse_class',
  },
  {
    label: 'Chemical subclass',
    src: 'fine_class',
  },
  {
    label: 'Dataset id',
    src: 'dsId',
  },
  {
    label: 'Sample name',
    src: 'Sample name',
  },
  {
    label: 'Lab',
    src: 'Participant lab',
  },
  {
    label: 'Molecule',
    src: 'name',
  },
  // {
  //   label: 'Formula',
  //   src: 'f',
  // },
]

const CLASSIFICATION_METRICS = {
  fine_class: true,
  main_coarse_class: true,
}

const PATHWAY_METRICS = {
  fine_path: true,
  main_coarse_path: true,
}

const VALUE_METRICS = {
  // count: {
  //   label: 'Count',
  //   src: 1,
  // },
  average: {
    label: 'Fraction detected',
    src: 2,
  },
}

const filterMap: any = {
  a: 'add',
  main_coarse_class: 'q',
  fine_class: 'q',
  main_coarse_path: 'q',
  fine_path: 'q',
  n: 'q',
  d: 'ds',
  nL: 'nl',
  pol: 'mode',
  mS: 'MALDI matrix',
  t: 'MALDI matrix',
  name: 'mol',
}

const sortingOptions: any[] = [
  {
    value: 'ORDER_BY_SERIATE',
    label: 'Seriate ',
  },
  {
    value: 'ORDER_BY_NAME',
    label: 'Name',
  },
]

export default defineComponent({
  name: 'detectability',
  setup: function () {
    const router = useRouter()
    const route = useRoute()
    const pageSizes = [5, 15, 30, 100]
    const filterItem = {
      src: null,
      value: null,
      options: [],
    }
    const state = reactive<DashboardState>({
      colormap: route.query.cmap || '-YlGnBu',
      filter: [cloneDeep(filterItem)],
      orderBy: 'ORDER_BY_SERIATE',
      sortingOrder: 'DESCENDING',
      hiddenYValues: [],
      hiddenXValues: [],
      xAxisValues: [],
      yAxisValues: [],
      data: [],
      dataSource: 'EMBL',
      rawData: undefined,
      rawDataInter: undefined,
      usedData: undefined,
      isEmpty: false,
      firstGenerated: false,
      baseData: undefined,
      visualMap: {},
      options: {
        xAxis: null,
        yAxis: null,
        aggregation: null,
        valueMetric: VALUE_METRICS.average.src,
      },
      pagination: {
        nOfPages: 1,
        pageSize: 15,
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
    const { result: sourcesResult } = useQuery<{ allSources: any }>(getDetectabilitySourcesQuery)
    const allSources = computed(() => sourcesResult.value?.allSources.map((source: any) => source.source))
    const { result: currentUser } = useQuery<{ currentUser: any }>(currentUserWithGroupDetectabilityQuery)
    const allowedSources = computed(() => {
      if (!currentUser.value) return []

      return flatten(
        currentUser.value?.currentUser?.groups?.map(
          (group: any) => group.group?.sources?.map((source: any) => source.source)
        )
      )
    })

    const initializeState = async () => {
      if (route.query.src) {
        await handleDataSrcChange(route.query.src, false)
      }
      if (route.query.page) {
        state.pagination.currentPage = parseInt(route.query.page as string, 10)
      }
      if (route.query.pageSize) {
        state.pagination.pageSize = parseInt(route.query.pageSize as string, 10)
      }
      if (route.query.xAxis) {
        await handleAxisChange(route.query.xAxis, true)
      }
      if (route.query.yAxis) {
        await handleAxisChange(route.query.yAxis, false)
      }
      if (route.query.agg) {
        handleAggregationChange(route.query.agg)
      }
      if (route.query.vis) {
        handleVisualizationChange(parseInt(route.query.vis as string, 10))
      }

      const filterSrc: any[] = !route.query.filter
        ? ['Polarity', 'nL']
        : Array.isArray(route.query.filter)
        ? route.query.filter
        : route.query.filter.split(',')

      filterSrc.forEach((item: any, index: number) => {
        if (index > 0) {
          addFilterItem()
        }
        handleFilterSrcChange(item, index)
      })

      if (route.query.filterValue) {
        ;(route.query.filterValue as string).split('|').forEach((item: any, index: number) => {
          const value = item.split('#')
          if (!Array.isArray(value) || (value.length > 0 && value[0])) {
            handleFilterValueChange(value, index)
          }
        })
      } else if (!route.query.filter) {
        // default filters
        handleFilterValueChange(['positive'], 0)
        handleFilterValueChange(['None'], 1)
      }

      if (state.options.xAxis && state.options.yAxis && state.options.aggregation) {
        state.firstGenerated = true
        await loadData()
        buildValues()
      }

      if (route.query.cmap) {
        handleColormapChange(route.query.cmap)
      }
    }

    onMounted(() => {
      initializeState()
    })

    const buildFilterOptions = async (filterIndex: number) => {
      state.filter[filterIndex].loadingFilterOptions = true

      const options = await loadFilterValues(state.filter[filterIndex].src)
      state.filter[filterIndex].options = uniq(
        (options || []).map((item: any) => (item === null || item === undefined || item === 'null' ? 'None' : item))
      ).sort()
      state.filter[filterIndex].loadingFilterOptions = false
    }

    const loadData = async () => {
      try {
        state.loading = true

        const nonEmptyFilters = (state.filter || []).filter(
          (item: any) => item.src === 'nL' || (Array.isArray(item.value) ? item.value.join('#') : item.value)
        )
        const filter = nonEmptyFilters.map((item: any) => item.src).join(',')
        // .replace('main_coarse_class', 'coarse_class')
        // .replace('main_coarse_path', 'coarse_path')
        const filterValues = nonEmptyFilters
          .map((item: any) => (item.src === 'nL' || Array.isArray(item.value) ? item.value.join('#') : item.value))
          .filter((x: any) => x)
          .join('|')

        // load data
        const params: any = {
          predType: state.dataSource.toUpperCase(),
          xAxis: state.options.xAxis,
          yAxis: state.options.yAxis,
          loadPathway:
            Object.keys(PATHWAY_METRICS).includes(state.options.xAxis) ||
            Object.keys(PATHWAY_METRICS).includes(state.options.yAxis) ||
            (state.filter || []).findIndex((item: any) => Object.keys(PATHWAY_METRICS).includes(item.src)) !== -1,
          loadClass:
            Object.keys(CLASSIFICATION_METRICS).includes(state.options.xAxis) ||
            Object.keys(CLASSIFICATION_METRICS).includes(state.options.yAxis) ||
            (state.filter || []).findIndex((item: any) => Object.keys(CLASSIFICATION_METRICS).includes(item.src)) !==
              -1,
          queryType: 'data',
          filter,
          filterValues,
        }

        const query = Object.keys(params)
          .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
          .join('&')

        const baseUrl = 'https://a5wtrqusve2xmrnjx7t3kpitcm0piciq.lambda-url.eu-west-1.on.aws' // prod docker
        // const baseUrl = 'https://sotnykje7gwzumke4nums4horm0gujac.lambda-url.eu-west-1.on.aws' // prod
        // const baseUrl = 'http://localhost:8080' // local
        // const baseUrl = 'https://tif7fmvuyc7wk6etuql2zpjcwq0ixxmn.lambda-url.eu-west-1.on.aws' // test
        const response = await fetch(baseUrl + '?' + query)
        const parsedResponse = await response.json()
        state.usedData = parsedResponse // .body
      } catch (e) {
        state.usedData = {}
        state.data = []
      } finally {
        state.loading = false
      }
    }

    const loadFilterValues = async (filter: any) => {
      try {
        // load data

        // filter = filter === 'main_coarse_class' ? 'coarse_class' : filter
        // filter = filter === 'main_coarse_path' ? 'coarse_path' : filter
        const params: any = {
          predType: state.dataSource.toUpperCase(),
          xAxis: state.options.xAxis,
          yAxis: state.options.yAxis,
          loadPathway:
            Object.keys(PATHWAY_METRICS).includes(state.options.xAxis) ||
            Object.keys(PATHWAY_METRICS).includes(state.options.yAxis) ||
            (state.filter || []).findIndex((item: any) => Object.keys(PATHWAY_METRICS).includes(item.src)) !== -1,
          loadClass:
            Object.keys(CLASSIFICATION_METRICS).includes(state.options.xAxis) ||
            Object.keys(CLASSIFICATION_METRICS).includes(state.options.yAxis) ||
            (state.filter || []).findIndex((item: any) => Object.keys(CLASSIFICATION_METRICS).includes(item.src)) !==
              -1,
          filter,
          queryType: 'filterValues',
        }

        const query = Object.keys(params)
          .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
          .join('&')

        const baseUrl = 'https://a5wtrqusve2xmrnjx7t3kpitcm0piciq.lambda-url.eu-west-1.on.aws' // prod docker
        // const baseUrl = 'https://sotnykje7gwzumke4nums4horm0gujac.lambda-url.eu-west-1.on.aws'
        // const baseUrl = 'http://localhost:8080' // local

        const response = await fetch(baseUrl + '?' + query)
        const filterJson = await response.json()
        return filterJson.values // .body.values
      } catch (e) {
        return null
      }
    }

    const buildValues = async () => {
      try {
        state.buildingChart = true
        const chartData = state.usedData
        if (!chartData) return
        const data = chartData?.data
        let xAxisValues: string[] = chartData.xAxisSorting ? chartData.xAxisSorting : chartData.xAxis
        let yAxisValues: string[] = chartData.yAxisSorting ? chartData.yAxisSorting : chartData.yAxis

        if (!chartData.yAxisSorting || state.orderBy === 'ORDER_BY_NAME') {
          yAxisValues = orderBy(
            yAxisValues,
            [(axis) => axis.toLowerCase()],
            [state.sortingOrder === 'DESCENDING' ? 'desc' : 'asc']
          )
          xAxisValues = orderBy(
            xAxisValues,
            [(axis) => axis.toLowerCase()],
            [state.sortingOrder === 'DESCENDING' ? 'desc' : 'asc']
          )
        } else if (state.sortingOrder === 'DESCENDING') {
          yAxisValues = cloneDeep(yAxisValues).reverse()
          xAxisValues = cloneDeep(xAxisValues).reverse()
        }

        if (state.options.yAxis === 'fine_class' || state.options.yAxis === 'fine_path') {
          yAxisValues = orderBy(
            yAxisValues,
            [(axis) => axis.toLowerCase()],
            [state.sortingOrder === 'DESCENDING' ? 'desc' : 'asc']
          )
        }

        const auxData: any = groupBy(data, state.options.xAxis)
        Object.keys(auxData).forEach((key: string) => {
          auxData[key] = keyBy(
            auxData[key],
            state.options.yAxis === 'fine_class' || state.options.yAxis === 'fine_path'
              ? 'class_full'
              : state.options.yAxis
          )
        })

        const dotValues: any = []
        const yMaxValue: any = (maxBy(data!, 'fraction_detected')! as any)!.fraction_detected
        let maxColor: number = 0

        // build chart
        xAxisValues.forEach((xKey: any, xIndex: number) => {
          yAxisValues.forEach((yKey: any, yIndex: number) => {
            const isEmpty: any = auxData[xKey][yKey] === undefined
            const item: any = auxData[xKey][yKey] || {}
            const pointAggregation: any = isEmpty ? 0 : item[state.options.aggregation]

            maxColor = pointAggregation > maxColor ? pointAggregation : maxColor

            const value: number = isEmpty ? 0 : item.fraction_detected
            const normalizedValue = isEmpty ? 0 : yMaxValue === 0 ? 0 : value / yMaxValue
            dotValues.push({
              value: [xIndex, yIndex, normalizedValue, pointAggregation, value],
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
          type: state.options.aggregation !== 'main_coarse_class' ? 'continuous' : 'piecewise',
          show: true,
          calculable: true,
          dimension: 3,
          bottom: 0,
          left: 'center',
          inRange: {
            color: getColorScale(state.colormap).range,
          },
          handleStyle: {
            borderColor: '#000',
            borderWidth: 1,
          },
          orient: 'horizontal',
          min: 0,
          max: maxColor,
          formatter: function (value: any) {
            return typeof value === 'number' ? value?.toFixed(2) : value
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
      } catch (e) {
        console.error(e)
      } finally {
        state.buildingChart = false
      }
    }

    const handleAggregationChange = (value: any) => {
      state.options.aggregation = value
      router.replace({ name: 'detectability', query: { ...getQueryParams(), agg: value } })
    }

    const handleFilterValueChange = async (value: any, idx: any = 0) => {
      state.filter[idx].value = value
      const filterValueParams = state.filter
        .map((item: any) => (Array.isArray(item.value) ? item.value.join('#') : item.value))
        .join('|')

      router.replace({
        name: 'detectability',
        query: {
          ...getQueryParams(),
          filterValue: filterValueParams,
        },
      })
    }

    const removeFilterItem = async () => {
      const value = state.filter[state.filter.length - 1].value
      state.filter.pop()
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation && value) {
        await loadData()
        buildValues()
      }
    }

    const addFilterItem = () => {
      const filters = state.filter
      filters.push(cloneDeep(filterItem))
      state.filter = filters
    }

    const handleColormapChange = (color: any) => {
      state.colormap = color
      router.replace({ name: 'detectability', query: { ...getQueryParams(), cmap: color } })
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation) {
        buildValues()
      }
    }

    const handleItemClick = (item: any) => {
      // get info from clicked chart item and open on a metaspace url
      const baseUrl = 'https://metaspace2020.eu/annotations?db_id=304'
      // const baseUrl = 'http://localhost:8999/annotations?db_id=304'
      let url = baseUrl
      const formulas: string = item?.data?.label?.formulas?.join('|')
      const yAxisFilter: any = filterMap[state.options.yAxis]
      const xAxisFilter: any = filterMap[state.options.xAxis]

      // set dataset ids filter
      if ((item?.data?.label?.datasetIds || []).length > 0) {
        url += `&ds=${(item?.data?.label?.datasetIds || []).join(',')}`
      }

      if (yAxisFilter) {
        const value =
          state.options.yAxis === 'fine_class' ||
          state.options.yAxis === 'main_coarse_class' ||
          state.options.yAxis === 'main_coarse_path' ||
          state.options.yAxis === 'fine_path' ||
          state.options.yAxis === 'name'
            ? formulas
            : (yAxisFilter.includes('MALDI matrix') ? item.data.label.matrix.join('|') : item.data.label.y)
            ? item.data.label.matrix.join('|')
            : item.data.label.y
        url += `&${yAxisFilter}=${encodeURIComponent(value)}`
      }
      if (xAxisFilter) {
        const value =
          state.options.xAxis === 'fine_class' ||
          state.options.xAxis === 'main_coarse_class' ||
          state.options.xAxis === 'main_coarse_path' ||
          state.options.xAxis === 'fine_path' ||
          state.options.xAxis === 'name'
            ? formulas
            : (xAxisFilter.includes('MALDI matrix') ? item.data.label.matrix.join('|') : item.data.label.x)
            ? item.data.label.matrix.join('|')
            : item.data.label.x
        url += `&${xAxisFilter}=${encodeURIComponent(value)}`
      }
      window.open(url, '_blank')
    }

    const handleVisualizationChange = (value: number = VIEW.SCATTER) => {
      state.selectedView = value
      router.replace({ name: 'detectability', query: { ...getQueryParams(), vis: value } })
    }

    const getQueryParams = () => {
      const queryObj: any = {
        filter: state.filter.map((item: any) => item.src).join(','),
        filterValue: state.filter
          .map((item: any) => (Array.isArray(item.value) ? item.value.join('#') : item.value))
          .join('|'),
        xAxis: state.options.xAxis,
        yAxis: state.options.yAxis,
        agg: state.options.aggregation,
        metric: state.options.valueMetric,
        page: state.pagination.currentPage,
        pageSize: state.pagination.pageSize,
        src: state.dataSource.toUpperCase(),
        vis: state.selectedView,
        cmap: state.colormap,
      }

      Object.keys(queryObj).forEach((key: string) => {
        if (!queryObj[key]) {
          delete queryObj[key]
        }
      })

      return queryObj
    }

    const handleSortChange = (value: string, sortingOrder: string) => {
      state.orderBy = !value ? 'ORDER_BY_SERIATE' : value
      state.sortingOrder = !sortingOrder ? 'DESCENDING' : sortingOrder
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation) {
        state.loading = true
        setTimeout(() => {
          buildValues()
        }, 1000)
      }
    }

    const handleDataSrcChange = async (text: any, buildChart: boolean = true) => {
      const changedValue = text !== state.dataSource
      const changedFromEmbl = changedValue && (text.toUpperCase() === 'EMBL' || state.dataSource === 'EMBL')
      state.dataSource = text.toUpperCase()

      if (changedFromEmbl) {
        state.options.xAxis = undefined
        state.options.yAxis = undefined
        state.options.aggregation = undefined
        router.replace({ name: 'detectability', query: { src: text } })
        state.isEmpty = true
        state.firstGenerated = false
      } else {
        router.replace({ name: 'detectability', query: { ...getQueryParams(), src: text } })
      }

      if (state.options.xAxis && state.options.yAxis && changedValue) {
        state.filter = [cloneDeep(filterItem)]
      }
      if (state.options.xAxis && state.options.yAxis && state.options.aggregation && changedValue && buildChart) {
        state.isEmpty = false
        await loadData()
        await handleAxisChange(state.options.xAxis, true)
        await handleAxisChange(state.options.yAxis, false)
        await buildValues()
      } else if (changedValue) {
        state.isEmpty = true
      }
    }

    const handleFilterSrcChange = (value: any, idx: any = 0) => {
      const isNew = value !== state.filter[idx]?.src

      // fine_path
      state.filter[idx].src = value
      const filterSrcParams = state.filter.map((item: any) => item.src).join(',')
      router.replace({
        name: 'detectability',
        query: { ...getQueryParams(), filter: filterSrcParams },
      })
      buildFilterOptions(idx)
      if (isNew) {
        handleFilterValueChange(null, idx)
      }
    }

    const handleAxisSwap = async () => {
      const { xAxis, yAxis } = state.options
      await handleAxisChange(yAxis, true)
      await handleAxisChange(xAxis, false)
    }

    const handleGenerateChart = async () => {
      state.firstGenerated = true
      await loadData()
      await buildValues()
    }

    const handleAxisChange = async (value: any, isXAxis: boolean = true) => {
      if (isXAxis) {
        state.options.xAxis = value
        router.replace({
          name: 'detectability',
          query: { ...getQueryParams(), xAxis: value },
        })
      } else {
        state.options.yAxis = value
        router.replace({
          name: 'detectability',
          query: { ...getQueryParams(), yAxis: value },
        })
      }

      // reassign class according to options
      if (
        value === 'main_coarse_class' &&
        state.filter.findIndex((filter: any) => filter.src === 'coarse_class') !== -1
      ) {
        const idx: number = state.filter.findIndex((filter: any) => filter.src === 'coarse_class')
        state.filter[idx].src = 'main_coarse_class'
      } else if (
        value === 'fine_class' &&
        state.filter.findIndex((filter: any) => filter.src === 'main_coarse_class') !== -1
      ) {
        const idx: number = state.filter.findIndex((filter: any) => filter.src === 'main_coarse_class')
        state.filter[idx].src = 'coarse_class'
      } else if (
        value === 'main_coarse_path' &&
        state.filter.findIndex((filter: any) => filter.src === 'coarse_path') !== -1
      ) {
        const idx: number = state.filter.findIndex((filter: any) => filter.src === 'coarse_path')
        state.filter[idx].src = 'main_coarse_path'
      } else if (
        value === 'fine_path' &&
        state.filter.findIndex((filter: any) => filter.src === 'main_coarse_path') !== -1
      ) {
        const idx: number = state.filter.findIndex((filter: any) => filter.src === 'main_coarse_path')
        state.filter[idx].src = 'coarse_path'
      }
    }

    const renderFilters = (xLabelItem: string, yLabelItem: string) => {
      return (
        <div class="filter-container justify-between">
          <div class="flex flex-wrap">
            <div class="filter-box m-2">
              <span class="filter-label mb-3">
                Data source
                <ElTooltip content="Select between the labs where the data was gathered from." placement="top">
                  <ElIcon class="help-icon text-sm ml-1 cursor-pointer">
                    <QuestionFilled />
                  </ElIcon>
                </ElTooltip>
              </span>
              <ElRadioGroup
                disabled={state.loading}
                modelValue={state.dataSource}
                size="small"
                onChange={(text: any) => {
                  handleDataSrcChange(text)
                }}
              >
                <ElRadioButton label="EMBL" size="default" />
                {(allowedSources.value?.includes('ALL') || allSources.value?.includes('ALLEMBL')) && (
                  <ElRadioButton label="ALL" />
                )}
                {(allowedSources.value?.includes('INTERLAB') || allSources.value?.includes('ALLINTERLAB')) && (
                  <ElRadioButton label="INTERLAB" />
                )}
              </ElRadioGroup>
            </div>
            <div class="filter-box m-2">
              <span class="x-axis-label mb-2">X axis</span>
              <ElSelect
                class="select-box-mini"
                clearable
                modelValue={state.options.xAxis}
                onClear={() => {
                  state.options.xAxis = null
                }}
                onChange={(value: number) => {
                  handleAxisChange(value)
                }}
                placeholder="Select axis"
                disabled={state.loading}
                size="small"
              >
                {orderBy(AXIS_VALUES[state.dataSource], ['label'], ['asc']).map((option: any) => {
                  return (
                    <ElOption
                      label={option.label}
                      value={option.src}
                      disabled={
                        state.options.yAxis &&
                        state.dataSource &&
                        ALLOWED_COMBINATIONS[state.dataSource] &&
                        yLabelItem &&
                        !ALLOWED_COMBINATIONS[state.dataSource][yLabelItem].includes(option.label)
                      }
                    />
                  )
                })}
              </ElSelect>
            </div>
            <div class="filter-box m-2 swap-box">
              <ElButton class="swap-btn" size="small" icon="Sort" onClick={handleAxisSwap} disabled={state.loading} />
            </div>
            <div class="filter-box m-2">
              <span class="y-axis-label mb-2">Y axis</span>
              <ElSelect
                clearable
                class="select-box-mini"
                modelValue={state.options.yAxis}
                onClear={() => {
                  state.options.yAxis = null
                }}
                onChange={(value: number) => {
                  handleAxisChange(value, false)
                }}
                disabled={state.loading}
                placeholder="Select axis"
                size="small"
              >
                {orderBy(AXIS_VALUES[state.dataSource], ['label'], ['asc']).map((option: any) => {
                  return (
                    <ElOption
                      label={option.label}
                      value={option.src}
                      disabled={
                        state.options.xAxis &&
                        state.dataSource &&
                        ALLOWED_COMBINATIONS[state.dataSource] &&
                        xLabelItem &&
                        !ALLOWED_COMBINATIONS[state.dataSource][xLabelItem].includes(option.label)
                      }
                    />
                  )
                })}
              </ElSelect>
            </div>
            <div class="filter-box m-2">
              <span class="aggregation-label mb-2">Color</span>
              <ElSelect
                clearable
                class="select-box-mini"
                modelValue={state.options.aggregation}
                onClear={() => {
                  state.options.aggregation = null
                }}
                onChange={(value: number) => {
                  handleAggregationChange(value)
                }}
                disabled={state.loading}
                placeholder="Select color metric"
                size="small"
              >
                {orderBy(AGGREGATED_VALUES[state.dataSource], ['label'], ['asc']).map((option: any) => {
                  return <ElOption label={option.label} value={option.src} />
                })}
              </ElSelect>
            </div>
            <div class="filter-box m-2">
              <span class="filter-label mb-3">Sorting </span>
              <SortDropdown
                class="pb-2"
                size="small"
                tooltipPlacement="top"
                defaultOption={state.orderBy}
                defaultSorting={state.sortingOrder}
                options={sortingOptions}
                clearable={false}
                onSort={handleSortChange}
              />
            </div>
            <div class="filter-box m-2">
              <span class="filter-label mb-3 invisible">Generate</span>
              <ElButton
                type="primary"
                size="small"
                class="gen-btn"
                loading={state.loading}
                disabled={!(state.options.xAxis && state.options.yAxis && state.options.aggregation)}
                onClick={handleGenerateChart}
              >
                Generate chart
              </ElButton>
            </div>
          </div>
          <div>
            <div class="filter-box m-2">
              <span class="filter-label mb-2">Filters</span>
              {state.filter.map((filter: any, filterIdx: number) => {
                return (
                  <div class="flex flex-wrap justify-center">
                    <ElSelect
                      clearable
                      class="select-box-mini mr-2"
                      modelValue={filter.src}
                      onChange={(value: number) => {
                        handleFilterSrcChange(value, filterIdx)
                      }}
                      disabled={state.loading || state.usedData === undefined}
                      placeholder="Select filter metric"
                      size="small"
                    >
                      {orderBy(FILTER_VALUES, ['label'], ['asc']).map((option: any) => {
                        if (
                          (state.options.yAxis !== 'fine_class' &&
                            state.options.xAxis !== 'fine_class' &&
                            option.src === 'coarse_class') ||
                          (state.options.yAxis !== 'fine_path' &&
                            state.options.xAxis !== 'fine_path' &&
                            option.src === 'coarse_path') ||
                          (FILTER_DISABLED_COMBINATIONS[state.options.yAxis] &&
                            FILTER_DISABLED_COMBINATIONS[state.options.yAxis].includes(option.src)) ||
                          (FILTER_DISABLED_COMBINATIONS[state.options.xAxis] &&
                            FILTER_DISABLED_COMBINATIONS[state.options.xAxis].includes(option.src))
                        ) {
                          return <div />
                        }
                        return (
                          <ElOption
                            disabled={
                              state.filter.map((item: any) => item.src).includes(option.src) ||
                              (FILTER_DISABLED_COMBINATIONS[state.options.yAxis] &&
                                FILTER_DISABLED_COMBINATIONS[state.options.yAxis].includes(option.src)) ||
                              (FILTER_DISABLED_COMBINATIONS[state.options.xAxis] &&
                                FILTER_DISABLED_COMBINATIONS[state.options.xAxis].includes(option.src))
                            }
                            label={option.label}
                            value={option.src}
                          />
                        )
                      })}
                    </ElSelect>
                    <ElSelect
                      class="select-box-mini mr-2"
                      modelValue={filter.value}
                      loading={state.filter[filterIdx].loadingFilterOptions}
                      filterable
                      clearable
                      multiple
                      noDataText="No data"
                      onChange={(value: number) => {
                        handleFilterValueChange(value, filterIdx)
                      }}
                      disabled={state.loading}
                      placeholder="Select filter value"
                      size="small"
                    >
                      {filter.options.map((option: any) => {
                        return <ElOption label={!option ? 'None' : option} value={!option ? 'None' : option} />
                      })}
                    </ElSelect>
                    <div
                      class="flex"
                      style={{
                        visibility: filterIdx !== 0 ? 'hidden' : 'visible',
                      }}
                    >
                      <div
                        class="icon"
                        onClick={removeFilterItem}
                        style={{
                          visibility: state.filter.length < 2 ? 'hidden' : 'visible',
                        }}
                      >
                        <ElIcon>
                          <RemoveFilled />
                        </ElIcon>
                      </div>
                      <div
                        class="icon"
                        onClick={addFilterItem}
                        style={{
                          visibility: state.filter.length >= FILTER_VALUES.length ? 'hidden' : 'visible',
                        }}
                      >
                        <ElIcon>
                          <CirclePlusFilled />
                        </ElIcon>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )
    }

    const renderVisualizations = (xLabelItem: string, yLabelItem: string, showChart: boolean) => {
      return (
        <div class="visualization-container">
          {showChart && renderHelp(xLabelItem, yLabelItem)}

          <div class="flex flex-col">
            <a
              href="https://sm-spotting-project.s3.eu-west-1.amazonaws.com/data_v3/detectability_source.zip"
              class={'files-link mb-1'}
            >
              Download results of the study
            </a>
            <div class="visualization-selector">
              <span class="filter-label">Visualization</span>
              <div class={`ml-2 icon-holder ${state.selectedView === VIEW.SCATTER ? 'selected' : ''}`}>
                <ScatterChart
                  class="roi-icon fill-current"
                  onClick={() => {
                    handleVisualizationChange(VIEW.SCATTER)
                  }}
                />
              </div>
              <div class={`icon-holder ${state.selectedView === VIEW.HEATMAP ? 'selected' : ''}`}>
                <ElIcon
                  class="vis-icon mr-6 text-4xl"
                  onClick={() => {
                    handleVisualizationChange(VIEW.HEATMAP)
                  }}
                >
                  <Grid />
                </ElIcon>
              </div>
            </div>
          </div>
        </div>
      )
    }

    const renderHelp = (xLabelItem: string, yLabelItem: string) => {
      const colorLabelItem: any = AGGREGATED_VALUES[state.dataSource].find(
        (item: any) => item.src === state.options.aggregation
      )

      if (!xLabelItem && !yLabelItem && !colorLabelItem?.label) {
        return null
      }

      return (
        <div class="help-container">
          <ElIcon class="help-icon">
            <QuestionFilled />
          </ElIcon>
          You are looking at Color ({colorLabelItem?.label}) of ions broken down by X ({xLabelItem}) in Y ({yLabelItem})
        </div>
      )
    }

    const renderDashboardInstructions = () => {
      return (
        <div class="dashboard-instructions">
          <ElIcon class="info-icon mr-6 text-4xl">
            <InfoFilled />
          </ElIcon>
          <div class="flex flex-col text-xs w-2/4">
            <p class="instruction-title mb-2">Steps:</p>
            <p>
              1 - Select the x axis metric in the <span class="x-axis-label">red</span> zone;
            </p>
            <p>
              2 - Select the y axis metric in the <span class="y-axis-label">green</span> zone;
            </p>
            <p>
              3 - Select the color in the <span class="aggregation-label">blue</span> zone;
            </p>
            <p>4 - Apply the filters you desire.</p>{' '}
            <p>
              5 - Click on the button <b>Generate chart</b> to apply the changes and generate the chart.
            </p>
            <p>6 - Click on the dots to be redirected to the corresponding annotations in METASPACE.</p>
          </div>
        </div>
      )
    }

    const onPageChange = (newPage: number) => {
      state.pagination.currentPage = newPage
      router.replace({
        name: 'detectability',
        query: { ...getQueryParams(), page: newPage.toString() },
      })
    }

    const onPageSizeChange = (newSize: number) => {
      state.pagination.pageSize = newSize
      router.replace({
        name: 'detectability',
        query: { ...getQueryParams(), pageSize: newSize.toString() },
      })
    }

    const renderPagination = (total: number) => {
      return (
        <div class="block">
          <ElPagination
            total={total}
            pageSize={state.pagination.pageSize}
            pageSizes={pageSizes}
            currentPage={state.pagination.currentPage}
            onSizeChange={onPageSizeChange}
            onCurrentChange={onPageChange}
            layout="prev,pager,next,sizes"
          />
          {/* {state.selectedView === VIEW.SCATTER && renderRadiusHelp()} */}
        </div>
      )
    }

    const renderScatterChart = (yAxisValues: any, xAxisValues: any, total: number, chartData: any) => {
      return (
        <div class="chart-container">
          <DashboardScatterChart
            xOption={state.options.xAxis}
            yOption={state.options.yAxis}
            xAxis={xAxisValues}
            yAxis={yAxisValues}
            size={yAxisValues.length * 40}
            data={chartData}
            visualMap={state.visualMap}
            onItemSelected={handleItemClick}
          />
          {!state.loading && renderPagination(total)}
        </div>
      )
    }

    const renderHeatmapChart = (yAxisValues: any, xAxisValues: any, total: number, chartData: any) => {
      return (
        <div class="chart-container">
          <DashboardHeatmapChart
            xOption={state.options.xAxis}
            yOption={state.options.yAxis}
            xAxis={xAxisValues}
            yAxis={yAxisValues}
            size={yAxisValues.length * 40}
            data={chartData}
            visualMap={state.visualMap}
            onItemSelected={handleItemClick}
          />
          {!state.loading && renderPagination(total)}
        </div>
      )
    }

    return () => {
      const showChart =
        state.firstGenerated &&
        ((route.query.xAxis && route.query.yAxis && route.query.agg) ||
          (state.options.xAxis && state.options.yAxis && state.options.aggregation))
      const { selectedView } = state
      const isLoading = state.loading || state.buildingChart
      const yLabelItem: any = AXIS_VALUES[state.dataSource].find((item: any) => item.src === state.options.yAxis)
      const xLabelItem: any = AXIS_VALUES[state.dataSource].find((item: any) => item.src === state.options.xAxis)

      // paginate data on client-side
      const yAxisValues: any[] = state.yAxisValues
      let xAxisValues: any[] = state.xAxisValues
      const total = xAxisValues.length
      const start = (state.pagination.currentPage - 1) * state.pagination.pageSize
      const end = (state.pagination.currentPage - 1) * state.pagination.pageSize + state.pagination.pageSize
      xAxisValues = xAxisValues.slice(start, end)
      const chartData = cloneDeep(state.data)
        .slice(yAxisValues.length * start, yAxisValues.length * end)
        .map((item: any) => {
          item.value[0] = item.value[0] - start // remove pages offset from chart values index
          return item
        })

      return (
        <div class="dashboard-container mb-4">
          {renderFilters(xLabelItem?.label, yLabelItem?.label)}
          {renderVisualizations(xLabelItem?.label, yLabelItem?.label, showChart)}
          <div class="content-container">
            {showChart && (
              <div class="feature-box">
                <ShareLink name="detectability" query={getQueryParams()} />
                <ChartSettings defaultColormap={state.colormap} onColor={handleColormapChange} />
              </div>
            )}
            {!showChart && renderDashboardInstructions()}
            {!isLoading &&
              showChart &&
              selectedView === VIEW.SCATTER &&
              renderScatterChart(yAxisValues, xAxisValues, total, chartData)}
            {!isLoading &&
              showChart &&
              selectedView === VIEW.HEATMAP &&
              renderHeatmapChart(yAxisValues, xAxisValues, total, chartData)}
            {isLoading && (
              <div class="absolute">
                <ElIcon class="is-loading">
                  <Loading />
                </ElIcon>
              </div>
            )}
          </div>
        </div>
      )
    }
  },
})
