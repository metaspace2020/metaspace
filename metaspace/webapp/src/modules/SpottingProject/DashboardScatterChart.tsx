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
  MarkLineComponent,
  MarkAreaComponent,
} from 'echarts/components'
import './DashboardScatterChart.scss'
import { truncate } from 'lodash-es'

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
  MarkLineComponent,
  VisualMapContinuousComponent,
  MarkAreaComponent,
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
  size: number
  xOption: string
  yOption: string
}

interface DashboardScatterChartState {
  scaleIntensity: boolean
  markArea: any
  chartOptions: any
  size: number
}

const PEAK_FILTER = {
  ALL: 1,
  FDR: 2,
}

const markAreaPalette = ['#9b5fe0', '#16a4d8', '#60dbe8', '#8bd346', '#efdf48', '#f9a52c', '#d64e12']

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
    size: {
      type: Number,
      default: 600,
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

    const state = reactive<DashboardScatterChartState>({
      scaleIntensity: false,
      size: 600,
      markArea: undefined,
      chartOptions: {
        title: {
          text: '',
        },
        toolbox: {
          feature: {
            saveAsImage: {
              title: ' ',
              name: 'detectability',
            },
          },
        },
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
          boundaryGap: true,
          splitLine: {
            show: false,
          },
          axisLine: {
            show: false,
          },
          axisTick: {
            show: false,
          },
          axisLabel: {
            show: true,
            interval: 0,
            rotate: 30,
            formatter: function(value :string) {
              return value?.length > 25 ? value.substring(0, 25) + '...' : value
            },
          },
          position: 'top',
        },
        yAxis:
          {
            type: 'category',
            data: [],
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
        series: {
          type: 'scatter',
          animation: false,
          markLine: {},
          symbolSize: function(val: any) {
            return val[2] * 30
          },
          itemStyle: {
            borderColor: 'black',
          },
          data: [],
        },
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
      Object.keys(globalCategories).map((key: string, idx: number) => {
        markData.push({
          name: key,
          yAxis: globalCategories[key],
          color: markAreaPalette[idx % markAreaPalette.length],
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

      if (xAxisData.value.length > 3) {
        auxOptions.grid.right = '5%'
      } else {
        auxOptions.grid.right = '40%'
      }

      auxOptions.xAxis.data = xAxisData.value

      if (auxOptions.xAxis.data.length > 30) {
        auxOptions.xAxis.axisLabel.rotate = 90
        auxOptions.series.symbolSize = function(val: any) {
          return val[2] * 10
        }
      } else {
        auxOptions.xAxis.axisLabel.rotate = 30
        auxOptions.series.symbolSize = function(val: any) {
          return val[2] * 30
        }
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

      auxOptions.series.data = chartData.value
      // auxOptions.series.markLine.data = markData
      auxOptions.series.markArea = {}
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

      return auxOptions
    })

    const handleChartResize = () => {
      const chartRef : any = spectrumChart.value
      if (chartRef && chartRef.chart) {
        chartRef.chart.resize()
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

    const handleChartRendered = () => {
      const chartRef : any = spectrumChart.value
      if (
        chartRef
        && chartRef.chart
        && !state.markArea
        && !(props.isLoading || props.isDataLoading)
        && chartOptions.value?.series?.markLine?.data?.length > 0
      ) {
        const auxOptions : any = chartOptions.value
        if (auxOptions) {
          setTimeout(() => {
            const markArea : any = { silent: true, data: [] }
            const offset = ((state.size - 110) / (yAxisData.value?.length || 1)) / 2
            auxOptions.series.data.forEach((item: any, idx: number) => {
              if (item.value[0] === 0) {
                const [chartX, chartY] = chartRef.convertToPixel({ seriesIndex: 0 }, [item.value[0], item.value[1]])
                const re = /(.+)\s-agg-\s(.+)/
                const label = item.label.key
                const cat = label.replace(re, '$1')
                const markLine : any = auxOptions.series.markLine.data.find((markLine: any) => markLine.name === cat)
                markArea.data.push([{ y: chartY + offset, itemStyle: { color: markLine.color, opacity: 0.1 } },
                  { y: chartY - offset }])
              }
            })
            chartRef.chart.setOption({ series: { ...chartOptions.value.series, markArea } },
              { replaceMerge: ['series'] })
            state.markArea = markArea
          }, 2000)
        }
      }
    }

    const renderSpectrum = () => {
      const { isLoading, isDataLoading } = props

      return (
        <div class='chart-holder'
          style={{ height: `${state.size}px`, width: '100%' }}>
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
                // rendered: handleChartRendered,
              },
            }}
            class='chart'
            style={{ height: `${state.size}px`, width: '100%' }}
            options={chartOptions.value}/>
        </div>
      )
    }

    return () => {
      return (
        <div class={'dataset-browser-scatter-container'}>
          {renderSpectrum()}
        </div>
      )
    }
  },
})
