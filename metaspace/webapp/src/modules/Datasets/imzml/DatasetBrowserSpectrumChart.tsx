import { computed, defineComponent, onMounted, onUnmounted, reactive, ref } from '@vue/composition-api'
// @ts-ignore
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import {
  SVGRenderer,
} from 'echarts/renderers'
import {
  BarChart,
  LineChart,
} from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
} from 'echarts/components'
import './DatasetBrowserSpectrumChart.scss'
import moment from 'moment'

use([
  SVGRenderer,
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
])

interface DatasetBrowserSpectrumChartProps {
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

interface DatasetBrowserSpectrumChartState {
  scaleIntensity: boolean
  chartOptions: any
}

const PEAK_FILTER = {
  ALL: 1,
  FDR: 2,
  OFF: 3,
}

export const DatasetBrowserSpectrumChart = defineComponent<DatasetBrowserSpectrumChartProps>({
  name: 'DatasetBrowserSpectrumChart',
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
  setup(props, { emit }) {
    const spectrumChart = ref(null)
    const state = reactive<DatasetBrowserSpectrumChartState>({
      scaleIntensity: false,
      chartOptions: {
        grid: {
          top: 60,
          bottom: 80,
          left: '10%',
          right: '10%',
        },
        animation: false,
        tooltip: {
          show: true,
          formatter: function(value: any) {
            return value.data.tooltip
          },
        },
        toolbox: {
          right: 20,
          feature: {
            myTool1: {
              show: true,
              title: 'Restore',
              icon:
                'path://M512 981.333333c-209.866667 0-396.693333-126.026667-466.293333-314.08a35.52 35.52 0 0 1 '
                + '23.626666-44.426666 38.613333 38.613333 0 0 1 48 20.693333c58.666667 158.933333 217.013333 '
                + '265.493333 394.666667 265.6s336-106.666667 394.666667-266.133333a37.6 37.6 0 0 1 '
                + '28.853333-23.626667 38.986667 38.986667 0 0 1 35.786667 11.946667 34.773333 34.773333 '
                + '0 0 1 7.146666 35.36c-69.386667 188.373333-256.48 314.666667-466.453333 314.666666z '
                + 'm431.36-574.08a37.92 37.92 0 0 1-35.946667-24.266666C849.386667 222.56 690.613333 114.88 '
                + '512 114.72S174.72 222.346667 116.746667 382.773333A38.72 38.72 0 0 1 69.333333 403.733333a35.786667 '
                + '35.786667 0 0 1-24.106666-44.373333C113.333333 169.866667 301.013333 42.666667 512 '
                + '42.666667s398.666667 127.306667 467.146667 316.96a34.56 34.56 0 0 1-4.906667 32.64 '
                + '38.933333 38.933333 0 0 1-30.88 14.986666z',
              onclick: () => {
                handleZoomReset()
              },
            },
            dataZoom: {
              title: {
                zoom: 'Zoom',
                back: 'Zoom reset',
              },
              filterMode: 'none',
            },
            myTool2: {
              show: true,
              title: 'Download data',
              icon: 'path://M6 2h6v6c0 1.1.9 2 2 2h6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4c0-1.1.9-2 2-2zm2 11a1 '
                + '1 0 0 0 0 2h8a1 1 0 0 0 0-2H8zm0 4a1 1 0 0 0 0 2h4a1 1 0 0 0 0-2H8z ',
              onclick: () => {
                emit('download')
              },
            },
            saveAsImage: {
              title: 'Download',
              name: 'mass_spectrum',
            },
          },
        },
        xAxis: {
          name: 'm/z',
          splitLine: {
            show: false,
          },
          nameLocation: 'center',
          nameGap: 20,
          nameTextStyle: {
            fontWeight: 'bold',
            fontSize: 14,
          },
          type: 'value',
          axisLabel: {
            formatter: function(value: any) {
              return value.toFixed(0.4)
            },
          },
        },
        yAxis: {
          name: 'Intensity',
          splitLine: {
            show: false,
          },
          triggerEvent: true,
          nameLocation: 'center',
          nameGap: 60,
          nameTextStyle: {
            fontWeight: 'bold',
            fontSize: 14,
          },
          type: 'value',
          axisLabel: {
            formatter: function(value: any) {
              return state.scaleIntensity ? value : value.toExponential(2)
            },
          },
          boundaryGap: [0, '30%'],
        },
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: 0,
            filterMode: 'none',
          },
          {
            type: 'slider',
            yAxisIndex: 0,
            filterMode: 'none',
            right: 16,
          },
          {
            type: 'slider',
            xAxisIndex: 0,
            filterMode: 'none',
          },
        ],
        legend: {
          data: [{ name: 'Unannotated', icon: 'diamond' }, { name: 'Annotated', icon: 'circle' }],
          selectedMode: false,
        },
        series: [
          {
            name: 'Unannotated',
            type: 'bar',
            symbol: 'diamond',
            sampling: 'none',
            data: [],
            label: {
              show: true,
              position: 'top',
              formatter: '{b}',
            },
            labelLayout: {
              hideOverlap: true,
            },
            barWidth: 2,
            itemStyle: {
              color: '#DC3220',
            },
            markPoint: {
              symbol: 'circle',
              symbolSize: 10,
              label: {
                show: false,
              },
              data: [],
            },
          },
          {
            name: 'Annotated',
            type: 'bar',
            data: [],
            itemStyle: {
              color: '#005AB5',
            },
          },
        ],
      },
    })

    const chartOptions = computed(() => {
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

      return (
        <div class={'dataset-browser-spectrum-container'}>
          {
            (!isEmpty || isLoading)
            && renderSpectrum()
          }
        </div>
      )
    }
  },
})
