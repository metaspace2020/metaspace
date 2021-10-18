import { computed, defineComponent, onMounted, onUnmounted, reactive, ref } from '@vue/composition-api'
// @ts-ignore
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import {
  CanvasRenderer,
} from 'echarts/renderers'
import {
  BarChart,
  ScatterChart,
  LineChart,
} from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
  TitleComponent,
  VisualMapPiecewiseComponent,
  VisualMapContinuousComponent,
} from 'echarts/components'
import './DashboardScatterChart.scss'

use([
  CanvasRenderer,
  BarChart,
  ScatterChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
  TitleComponent,
  VisualMapPiecewiseComponent,
  VisualMapContinuousComponent,
])

interface DashboardScatterChartProps {
  isEmpty: boolean
  isLoading: boolean
  isDataLoading: boolean
  data: any[]
  visualMap: any
  xAxis: any[]
  yAxis: any[]
  annotatedData: any[]
  peakFilter: number
}

interface DashboardScatterChartState {
  scaleIntensity: boolean
  chartOptions: any
}

const PEAK_FILTER = {
  ALL: 1,
  FDR: 2,
}

export const DashboardScatterChart = defineComponent<DashboardScatterChartProps>({
  name: 'DashboardScatterChart',
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
    xAxis: {
      type: Array,
      default: () => [],
    },
    yAxis: {
      type: Array,
      default: () => [],
    },
    data: {
      type: Array,
      default: () => [],
    },
    visualMap: {
      type: Object,
      default: {},
    },
    annotatedData: {
      type: Array,
      default: () => [],
    },
    peakFilter: {
      type: Number,
      default: PEAK_FILTER.ALL,
    },
  },
  setup(props, { emit }) {
    const spectrumChart = ref(null)
    const xAxisData = computed(() => props.xAxis)
    const yAxisData = computed(() => props.yAxis)

    const state = reactive<DashboardScatterChartState>({
      scaleIntensity: false,
      chartOptions: {
        title: {
          text: 'Punch Card of Github',
        },
        legend: {
          data: ['Punch Card'],
          left: 'right',
        },
        tooltip: {
          position: 'top',
          formatter: function(params: any) {
            return params.value[2] + ' commits in ' + props.xAxis[params.value[0]]
          },
        },
        grid: {
          left: 2,
          top: 10,
          right: 20,
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          data: [],
          boundaryGap: false,
          splitLine: {
            show: false,
          },
          axisLine: {
            show: false,
          },
          axisLabel: {
            show: true,
            interval: 0,
            rotate: 30,
          },
          position: 'top',
        },
        yAxis: {
          type: 'category',
          data: [],
          axisLine: {
            show: false,
          },
        },
        series: [{
          type: 'scatter',
          symbolSize: function(val: any) {
            return val[2] * 2
          },
          data: [],
        }],
      },
    })

    const chartData = computed(() => props.data)
    const visualMap = computed(() => props.visualMap)
    const chartOptions = computed(() => {
      if (!xAxisData.value || !chartData.value || !visualMap.value) {
        return state.chartOptions
      }

      const auxOptions = state.chartOptions
      auxOptions.xAxis.data = xAxisData.value
      auxOptions.yAxis.data = yAxisData.value
      auxOptions.series[0].data = chartData.value
      if (visualMap.value && visualMap.value.type) {
        auxOptions.visualMap = visualMap.value
      }
      console.log('auxOptions', auxOptions)
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

    const renderEmptySpectrum = () => {
      return (
        <div class='dataset-browser-empty-spectrum'>
          <i class="el-icon-info info-icon mr-6"/>
          <div class='flex flex-col text-xs w-3/4'>
            <p class='font-semibold mb-2'>Steps:</p>
            <p>1 - Select a pixel on the image viewer</p>
            <p>2 - Apply the filter you desire</p>
            <p>3 - The interaction is multi-way, so you can also update the ion image via spectrum interaction</p>
          </div>
        </div>
      )
    }

    const renderSpectrum = () => {
      const { isLoading, isDataLoading } = props

      return (
        <div class='chart-holder'>
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
      return (
        <div class={'dataset-browser-spectrum-container'}>
          {renderSpectrum()}
        </div>
      )
    }
  },
})
