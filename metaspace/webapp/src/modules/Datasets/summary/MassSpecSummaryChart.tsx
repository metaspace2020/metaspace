import { computed, defineComponent, onMounted, onUnmounted, reactive, ref } from '@vue/composition-api'
// @ts-ignore
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import {
  SVGRenderer,
} from 'echarts/renderers'
import {
  ScatterChart,
} from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
} from 'echarts/components'
import './MassSpecSummaryChart.scss'
import { useQuery } from '@vue/apollo-composable'
import { DatasetDetailItem } from '../../../api/dataset'
import gql from 'graphql-tag'

use([
  SVGRenderer,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
])

interface MassSpecSummaryChartProps {
  isEmpty: boolean
  isLoading: boolean
  isDataLoading: boolean
  data: any[]
  annotatedData: any[]
  peakFilter: number
  normalization: number | undefined
  dataRange: any
  annotatedLabel: string
}

interface MassSpecSummaryChartState {
  scaleIntensity: boolean
  chartOptions: any
}

const PEAK_FILTER = {
  ALL: 1,
  FDR: 2,
  OFF: 3,
}

export const MassSpecSummaryChart = defineComponent<MassSpecSummaryChartProps>({
  name: 'MassSpecSummaryChart',
  props: {
    isEmpty: {
      type: Boolean,
      default: true,
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
    isDataLoading: {
      type: Boolean,
      default: false,
    },
    annotatedLabel: {
      type: String,
    },
    data: {
      type: Array,
      default: () => [],
    },
    dataRange: {
      type: Object,
      default: () => { return { maxX: 0, maxY: 0, minX: 0, minY: 0 } },
    },
    annotatedData: {
      type: Array,
      default: () => [],
    },
    peakFilter: {
      type: Number,
      default: PEAK_FILTER.ALL,
    },
    normalization: {
      type: Number,
    },
  },
  setup(props, { emit, root }) {
    const { $store } = root

    const matrixes = ['DESI', 'IR-MALDESI', 'NanoDESI', 'LAESI', 'SIMS', 'Other', 'MALDI-DHB', 'MALDI-CHCA', 'MALDI-DAN', 'MALDI-2,5-DHAP', 'MALDI-Mix', 'MALDI-N/A', 'MALDI-Norharmane', 'MALDI-NEDC', 'MALDI-9AA', 'MALDI-PNA', 'MALDI-MBT', 'MALDI-CMBT', 'MALDI-sDHB', 'MALDI-Other']

    // prettier-ignore
    const analyzers = ['Other', 'QTOF', 'TOF', 'Orbitrap', 'FTICR']

    // prettier-ignore
    const data_test = [
      { value: [2, 0, 10, 1.0413926851582251], label: { x: 'Other', y: 'NanoDESI' } },
      { value: [7, 0, 10, 1.0413926851582251], label: { x: 'Other', y: 'MALDI-CHCA' } },
      { value: [11, 0, 46, 1.6720978579357175], label: { x: 'Other', y: 'MALDI-N/A' } },
      { value: [19, 0, 2, 0.47712125471966244], label: { x: 'Other', y: 'MALDI-Other' } },
      { value: [0, 1, 14, 1.1760912590556813], label: { x: 'QTOF', y: 'DESI' } },
      { value: [6, 1, 43, 1.6434526764861874], label: { x: 'QTOF', y: 'MALDI-DHB' } },
      { value: [7, 1, 5, 0.7781512503836436], label: { x: 'QTOF', y: 'MALDI-CHCA' } },
      { value: [9, 1, 11, 1.0791812460476249], label: { x: 'QTOF', y: 'MALDI-2,5-DHAP' } },
      { value: [10, 1, 5, 0.7781512503836436], label: { x: 'QTOF', y: 'MALDI-Mix' } },
      { value: [12, 1, 3, 0.6020599913279624], label: { x: 'QTOF', y: 'MALDI-Norharmane' } },
      { value: [13, 1, 1, 0.3010299956639812], label: { x: 'QTOF', y: 'MALDI-NEDC' } },
      { value: [19, 1, 5, 0.7781512503836436], label: { x: 'QTOF', y: 'MALDI-Other' } },
      { value: [0, 2, 13, 1.146128035678238], label: { x: 'TOF', y: 'DESI' } },
      { value: [4, 2, 3, 0.6020599913279624], label: { x: 'TOF', y: 'SIMS' } },
      { value: [6, 2, 56, 1.7558748556724915], label: { x: 'TOF', y: 'MALDI-DHB' } },
      { value: [7, 2, 21, 1.3424226808222062], label: { x: 'TOF', y: 'MALDI-CHCA' } },
      { value: [8, 2, 4, 0.6989700043360189], label: { x: 'TOF', y: 'MALDI-DAN' } },
      { value: [9, 2, 24, 1.3979400086720377], label: { x: 'TOF', y: 'MALDI-2,5-DHAP' } },
      { value: [10, 2, 1, 0.3010299956639812], label: { x: 'TOF', y: 'MALDI-Mix' } },
      { value: [12, 2, 1, 0.3010299956639812], label: { x: 'TOF', y: 'MALDI-Norharmane' } },
      { value: [18, 2, 1, 0.3010299956639812], label: { x: 'TOF', y: 'MALDI-sDHB' } },
      { value: [19, 2, 2, 0.47712125471966244], label: { x: 'TOF', y: 'MALDI-Other' } },
      { value: [0, 3, 180, 2.2576785748691846], label: { x: 'Orbitrap', y: 'DESI' } },
      { value: [1, 3, 196, 2.294466226161593], label: { x: 'Orbitrap', y: 'IR-MALDESI' } },
      { value: [2, 3, 12, 1.1139433523068367], label: { x: 'Orbitrap', y: 'NanoDESI' } },
      { value: [3, 3, 4, 0.6989700043360189], label: { x: 'Orbitrap', y: 'LAESI' } },
      { value: [5, 3, 16, 1.2304489213782739], label: { x: 'Orbitrap', y: 'Other' } },
      { value: [6, 3, 1001, 3.0008677215312267], label: { x: 'Orbitrap', y: 'MALDI-DHB' } },
      { value: [7, 3, 94, 1.9777236052888478], label: { x: 'Orbitrap', y: 'MALDI-CHCA' } },
      { value: [8, 3, 132, 2.123851640967086], label: { x: 'Orbitrap', y: 'MALDI-DAN' } },
      { value: [9, 3, 44, 1.6532125137753437], label: { x: 'Orbitrap', y: 'MALDI-2,5-DHAP' } },
      { value: [10, 3, 38, 1.591064607026499], label: { x: 'Orbitrap', y: 'MALDI-Mix' } },
      { value: [11, 3, 4, 0.6989700043360189], label: { x: 'Orbitrap', y: 'MALDI-N/A' } },
      { value: [12, 3, 10, 1.0413926851582251], label: { x: 'Orbitrap', y: 'MALDI-Norharmane' } },
      { value: [13, 3, 2, 0.47712125471966244], label: { x: 'Orbitrap', y: 'MALDI-NEDC' } },
      { value: [14, 3, 3, 0.6020599913279624], label: { x: 'Orbitrap', y: 'MALDI-9AA' } },
      { value: [15, 3, 4, 0.6989700043360189], label: { x: 'Orbitrap', y: 'MALDI-PNA' } },
      { value: [16, 3, 3, 0.6020599913279624], label: { x: 'Orbitrap', y: 'MALDI-MBT' } },
      { value: [17, 3, 2, 0.47712125471966244], label: { x: 'Orbitrap', y: 'MALDI-CMBT' } },
      { value: [19, 3, 221, 2.346352974450639], label: { x: 'Orbitrap', y: 'MALDI-Other' } },
      { value: [0, 4, 2, 0.47712125471966244], label: { x: 'FTICR', y: 'DESI' } },
      { value: [2, 4, 36, 1.568201724066995], label: { x: 'FTICR', y: 'NanoDESI' } },
      { value: [3, 4, 9, 1.0], label: { x: 'FTICR', y: 'LAESI' } },
      { value: [4, 4, 2, 0.47712125471966244], label: { x: 'FTICR', y: 'SIMS' } },
      { value: [5, 4, 15, 1.2041199826559248], label: { x: 'FTICR', y: 'Other' } },
      { value: [6, 4, 1588, 3.2011238972073794], label: { x: 'FTICR', y: 'MALDI-DHB' } },
      { value: [7, 4, 437, 2.6414741105040997], label: { x: 'FTICR', y: 'MALDI-CHCA' } },
      { value: [8, 4, 26, 1.4313637641589874], label: { x: 'FTICR', y: 'MALDI-DAN' } },
      { value: [9, 4, 47, 1.6812412373755872], label: { x: 'FTICR', y: 'MALDI-2,5-DHAP' } },
      { value: [10, 4, 41, 1.6232492903979006], label: { x: 'FTICR', y: 'MALDI-Mix' } },
      { value: [11, 4, 6, 0.8450980400142568], label: { x: 'FTICR', y: 'MALDI-N/A' } },
      { value: [12, 4, 15, 1.2041199826559248], label: { x: 'FTICR', y: 'MALDI-Norharmane' } },
      { value: [13, 4, 4, 0.6989700043360189], label: { x: 'FTICR', y: 'MALDI-NEDC' } },
      { value: [14, 4, 1, 0.3010299956639812], label: { x: 'FTICR', y: 'MALDI-9AA' } },
      { value: [19, 4, 46, 1.6720978579357175], label: { x: 'FTICR', y: 'MALDI-Other' } },
    ]
    const spectrumChart = ref(null)
    const state = reactive<MassSpecSummaryChartState>({
      scaleIntensity: false,
      chartOptions: {
        title: {
          text: 'Number of dataset per analyzer/ion source/matrix',
          subtext: 'Positive',
          left: 'center',
          top: 0,
        },
        tooltip: {
          position: 'top',
          formatter: function(params: any) {
            return (
              params.value[2]
              + ' datasets in '
              + matrixes[params.value[0]]
              + ' of '
              + analyzers[params.value[1]]
            )
          },
        },
        grid: {
          left: 2,
          bottom: 10,
          right: 10,
          containLabel: true,
        },
        xAxis: [
          {
            data: ['', '', '', '', '', '', 'MALDI', '', '', '', '', '', ''],
            position: 'top',
          },
          {
            type: 'category',
            data: matrixes,
            axisLine: {
              show: false,
            },
            axisTick: {
              show: false,
            },
            axisLabel: {
              show: true,
              interval: 0,
              rotate: 90,
              formatter: function(value: any, index: number) {
                return value.replace('MALDI-', '')
              },
            },
            position: 'top',
          },
        ],
        yAxis: {
          type: 'category',
          data: analyzers,
          axisLine: {
            show: false,
          },
          axisTick: {
            show: false,
          },
          axisLabel: {
            verticalAlign: 'middle',
            show: true,
            interval: 0,
            fontFamily: 'monospace',
            rich: {
              b: {
                fontFamily: 'monospace',
                fontWeight: 'bold',
              },
              h: {
                fontFamily: 'monospace',
                color: '#fff',
              },
            },

          },
        },
        series: [
          {
            type: 'scatter',
            symbolSize: function(val: any) {
              console.log('val', val)
              return val[3] * 14
            },
            data: data_test,
            animationDelay: function(idx: number) {
              return idx * 5
            },
            label: {
              show: true,
              formatter: function(param: any) {
                console.log('para', param)
                return param.data.value[2]
              },
              minMargin: 10,
              position: 'top',
              // verticalAlign: 'middle'
            },
          },
        ],
      },
    })

    const query =
    gql`query GetMSSetupCounts($filter: DatasetFilter, $query: String) {
      countDatasetsPerGroup(query: {
        fields: [DF_ANALYZER_TYPE, DF_ION_SOURCE, DF_MALDI_MATRIX, DF_POLARITY],
        filter: $filter,
        simpleQuery: $query
      }) {
        counts {
          fieldValues
          count
        }
      }
    }`

    const {
      result: receivedDatasetsResult,
      loading: receivedDatasetsResultLoading,
    } = useQuery<any>(query, {
      filter: Object.assign({ status: 'FINISHED' }, $store.getters.gqlDatasetFilter),
      query: $store.getters.ftsQuery,
    })

    const chartOptions = computed(() => {
      return state.chartOptions
      const OFFSET : number = 20
      const auxOptions = state.chartOptions
      if (state.scaleIntensity) {
        auxOptions.series[0].data = props.data.map((data: any) => {
          return {
            ...data.dot,
            value: [data.dot.value[0], data.dot.value[1] / props.dataRange?.maxY * 100],
          }
        })
        auxOptions.series[0].markPoint.data = props.data.map((data: any) => {
          return {
            ...data.line,
            yAxis: data.line.yAxis / props.dataRange?.maxY * 100,
          }
        })
      } else {
        auxOptions.series[0].markPoint.data = props.data.map((data: any) => data.line)
        auxOptions.series[0].data = props.data.map((data: any) => data.dot)
      }
      auxOptions.xAxis.min = props.dataRange?.minX ? props.dataRange?.minX - OFFSET : 0
      auxOptions.xAxis.max = props.dataRange?.maxX ? props.dataRange?.maxX + OFFSET : 0
      auxOptions.yAxis.name = state.scaleIntensity ? 'Relative Intensity' : 'Intensity'
      auxOptions.yAxis.max = state.scaleIntensity ? 100 : (props.dataRange?.maxY + OFFSET)
      return auxOptions
    })

    const handleChartResize = () => {
      if (spectrumChart && spectrumChart.value) {
        // @ts-ignore
        spectrumChart.value.chart.resize()
      }
    }

    onMounted(() => {
      window.addEventListener('resize', handleChartResize)
    })

    onUnmounted(() => {
      window.removeEventListener('resize', handleChartResize)
    })

    const handleZoomReset = () => {
      if (spectrumChart && spectrumChart.value) {
        // @ts-ignore
        spectrumChart.value.chart.dispatchAction({
          type: 'dataZoom',
          start: 0,
          end: 100,
        })
      }
    }

    const handleItemSelect = (item: any) => {
      if (item.targetType === 'axisName') {
        state.scaleIntensity = !state.scaleIntensity
      } else {
        emit('itemSelected', item.data.mz)
      }
    }

    const renderSpectrum = () => {
      const { isLoading, isDataLoading } = props

      return (
        <div class='chart-holder'>
          {
            !(isLoading || isDataLoading)
            && props.annotatedLabel
            && <div class='annotated-legend'>{props.annotatedLabel}</div>
          }
          {
            (isLoading || isDataLoading)
            && <div class='loader-holder'>
              <div>
                <i
                  class="el-icon-loading"
                />
              </div>
            </div>
          }
          <ECharts
            ref={spectrumChart}
            autoResize={true}
            {...{
              on: {
                'zr:dblclick': handleZoomReset,
                click: handleItemSelect,
              },
            }}
            class='chart'
            options={chartOptions.value}/>
        </div>
      )
    }

    return () => {
      const { isEmpty, isLoading } = props

      console.log('receivedDatasetsResult', receivedDatasetsResult.value)

      return (
        <div class='mass-spec-chart'>
          {
            (!isEmpty || isLoading)
            && renderSpectrum()
          }
          {renderSpectrum()}
        </div>
      )
    }
  },
})
