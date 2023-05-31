import { computed, defineComponent, onMounted, onUnmounted, reactive, ref, watch } from '@vue/composition-api'
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
  size: number
  xOption: string
  yOption: string
}

interface DashboardHeatmapChartState {
  scaleIntensity: boolean
  chartOptions: any
  size: number
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
    size: {
      type: Number,
      default: 600,
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
    xOption: {
      type: String,
    },
    yOption: {
      type: String,
    },
  },
  setup(props, { emit }) {
    const spectrumChart = ref(null)
    const xAxisData = computed(() => props.xAxis)
    const yAxisData = computed(() => props.yAxis)

    const state = reactive<DashboardHeatmapChartState>({
      scaleIntensity: false,
      size: 600,
      chartOptions: {
        tooltip: {
          position: 'top',
          formatter: function(params: any) {
            const value = typeof params.value[4] === 'number' ? params.value[4] : params.value[3]
            return (value || 0).toFixed(2) + ' '
              + (params.data?.label?.y || '').replace(/-agg-/g, ' ') + ' in ' + (params.data?.label?.x || '')
          },
        },
        grid: {
          left: '5%',
          top: 20,
          right: '5%',
          bottom: 60,
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          data: [],
          splitArea: {
            show: true,
          },
          axisLabel: {
            show: true,
            interval: 0,
            rotate: 30,
            formatter: function(value :string) {
              return value?.length > 25 ? value.substring(0, 25) + '...' : value
            },
          },
          axisTick: {
            show: false,
          },
          position: 'top',
        },
        yAxis: {
          type: 'category',
          data: [],
          splitArea: {
            show: true,
          },
          axisTick: {
            show: false,
          },
          axisLabel: {
            show: true,
            interval: 0,
            verticalAlign: 'middle',
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
              name: 'detectability',
            },
          },
        },
        series: [{
          name: 'Punch Card',
          type: 'heatmap',
          markLine: {},
          data: [],
          label: {
            normal: {
              fontSize: 8,
              show: true,
              formatter: (param: any) => {
                return param.data?.label?.molecule ? '' : 'N/A'
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
      const globalCategories : any = {}
      const markData : any = []
      yAxisData.value.forEach((label: string, idx: number) => {
        const re = /(.+)\s-agg-\s(.+)/
        const found = label.match(re)
        const cat = label.replace(re, '$1')
        if (found) {
          globalCategories[cat] = idx
        }
      })
      Object.keys(globalCategories).map((key: string) => {
        markData.push({
          name: key,
          yAxis: globalCategories[key],
          label: {
            formatter: key,
            position: 'end',
            width: 100,
            overflow: 'break',
          },
          lineStyle: {
            color: 'transparent',
          },
        })
      })

      if (props.yOption === 'fine_class' || props.yOption === 'fine_path') {
        auxOptions.grid.right = 100
      } else {
        auxOptions.grid.right = '5%'
      }

      auxOptions.xAxis.data = xAxisData.value

      if (auxOptions.xAxis.data.length > 30) {
        auxOptions.xAxis.axisLabel.rotate = 90
        auxOptions.series[0].label.normal.fontSize = 6
      } else {
        auxOptions.xAxis.axisLabel.rotate = 30
        auxOptions.series[0].label.normal.fontSize = 10
      }

      // add no Neutral label
      if (props.xOption === 'nL') {
        const nullIdx = auxOptions.xAxis.data.findIndex((label: string) => label === '')
        if (nullIdx !== -1) {
          auxOptions.xAxis.data[nullIdx] = 'no neutral loss'
        }
      }

      let maxLength = 0
      auxOptions.yAxis.data = yAxisData.value
        .map((label: string, index: number) => {
          const re = /(.+)\s-agg-\s(.+)/
          const cat = label.replace(re, '$1')
          const value = label.replace(re, '$2')

          maxLength = (value.length + cat.length) > maxLength ? (value.length + cat.length) : maxLength

          return globalCategories[cat] === index ? label : label.replace(/.+-agg-\s(.+)/, '$1')
        })

      auxOptions.yAxis.axisLabel.formatter = function(label: any) {
        const re = /(.+)\s-agg-\s(.+)/
        const found = label.match(re)
        const cat = label.replace(re, '$1')
        const value = label.replace(re, '$2')
        const repeat = maxLength - cat.length - value.length
        return found ? `{b|${cat}}{h|${' '.repeat(repeat > 0 ? repeat : 0)}}${value}`
          : value
      }

      // add no Neutral label
      if (props.yOption === 'nL') {
        const nullIdx = auxOptions.yAxis.data.findIndex((label: string) => label === '')
        if (nullIdx !== -1) {
          auxOptions.yAxis.data[nullIdx] = 'no neutral loss'
        }
      }

      auxOptions.series[0].data = chartData.value
      // auxOptions.series[0].markLine.data = markData
      if (visualMap.value && visualMap.value.type) {
        auxOptions.visualMap = visualMap.value
      }

      // reset visualmap range on data update
      const chartRef : any = spectrumChart.value
      setTimeout(() => {
        if (chartRef && chartRef.chart) {
          chartRef.chart.dispatchAction({
            type: 'selectDataRange',
            selected: [0, visualMap.value?.max],
          })
        }
      }, 0)

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

    // set images and annotation related items when selected annotation changes
    watch(() => props.size, async(newValue) => {
      state.size = props.size < 600 ? 600 : props.size
      setTimeout(() => handleChartResize(), 500)
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
        emit('itemSelected', item)
      }
    }

    const renderSpectrum = () => {
      const { isLoading, isDataLoading } = props

      return (
        <div class='chart-holder'
          style={{ height: `${state.size}px` }}>
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
            style={{ height: `${state.size}px` }}
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
