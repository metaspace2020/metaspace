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
  HeatmapChart,
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
import './DashboardHeatmapChart.scss'

use([
  CanvasRenderer,
  BarChart,
  ScatterChart,
  LineChart,
  HeatmapChart,
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

interface DashboardHeatmapChartProps {
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

interface DashboardHeatmapChartState {
  scaleIntensity: boolean
  chartOptions: any
}

const PEAK_FILTER = {
  ALL: 1,
  FDR: 2,
}

// const items = ['not detected', 'M+H', 'M+Na', 'M+']

export const DashboardHeatmapChart = defineComponent<DashboardHeatmapChartProps>({
  name: 'DashboardHeatmapChart',
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

    const state = reactive<DashboardHeatmapChartState>({
      scaleIntensity: false,
      chartOptions: {
        tooltip: {
          position: 'top',
        },
        grid: {
          left: 2,
          top: 20,
          right: 20,
          bottom: 40,
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          data: [],
          splitArea: {
            show: true,
          },
          position: 'top',
        },
        yAxis: {
          type: 'category',
          data: [],
          splitArea: {
            show: true,
          },
        },
        visualMap: {
          min: 0,
          max: 10,
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          bottom: '15%',
        },
        toolbox: {
          feature: {
            saveAsImage: {
              title: ' ',
            },
          },
        },
        series: [{
          name: 'Punch Card',
          type: 'heatmap',
          data: [],
          label: {
            normal: {
              show: true,
              formatter: (param: any) => {
                return param.data?.label?.molecule ? param.data?.label?.molecule : 'Not detected'
              },
            },
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
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
      return state.chartOptions
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
      return (
        <div class={'dataset-browser-spectrum-container'}>
          {renderSpectrum()}
        </div>
      )
    }
  },
})
