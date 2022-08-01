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
    data: {
      type: Array,
      default: () => [],
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
            myTool2: {
              show: true,
              title: 'Download data',
              icon: 'path://M6 2h6v6c0 1.1.9 2 2 2h6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4c0-1.1.9-2 2-2zm2 11a1 '
                + '1 0 0 0 0 2h8a1 1 0 0 0 0-2H8zm0 4a1 1 0 0 0 0 2h4a1 1 0 0 0 0-2H8z ',
              onclick: () => {
                emit('download')
              },
            },
            dataZoom: {
              title: {
                zoom: 'Zoom',
                back: 'Zoom reset',
              },
            },
            saveAsImage: {
              title: 'Download',
            },
          },
        },
        xAxis: {
          name: 'm/z',
          splitLine: {
            show: false,
          },
          nameLocation: 'center',
          nameGap: 30,
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
            filterMode: 'empty',
          },
          {
            type: 'slider',
            yAxisIndex: 0,
            filterMode: 'empty',
            right: 16,
          },
        ],
        legend: {
          selectedMode: false,
          icon: 'roundRect',
        },
        series: [
          {
            name: 'Unannotated',
            type: 'bar',
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
              color: 'red',
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
              color: 'blue',
            },
          },
        ],
      },
    })

    const normalization = computed(() => props.normalization)
    const chartData = computed(() => props.data)
    const annotatedMzs = computed(() => props.annotatedData)
    const peakFilter = computed(() => props.peakFilter)
    const chartOptions = computed(() => {
      if (!chartData.value || (Array.isArray(chartData.value) && chartData.value.length === 0)) {
        return state.chartOptions
      }

      const auxOptions = state.chartOptions
      const data = []
      const annotatedTheoreticalMzs = annotatedMzs.value
      const markPointData: any[] = []
      let minX
      let maxX
      let maxIntensity = Math.max(...chartData.value[0].ints)

      maxIntensity = normalization.value ? (maxIntensity / normalization.value) : maxIntensity

      // maxIntensity if annotated
      if (peakFilter.value !== PEAK_FILTER.ALL) {
        const auxInts : number[] = []
        for (let i = 0; i < chartData.value[0].mzs.length; i++) {
          const xAxis = chartData.value[0].mzs[i]
          annotatedTheoreticalMzs.forEach((annotation: any) => {
            const theoreticalMz : number = annotation.mz
            const highestMz = theoreticalMz * 1.000003
            const lowestMz = theoreticalMz * 0.999997
            if (xAxis >= lowestMz && xAxis <= highestMz) {
              const auxInt = normalization.value ? (chartData.value[0].ints[i] / normalization.value)
                : chartData.value[0].ints[i]
              auxInts.push(auxInt)
            }
          })
        }
        maxIntensity = Math.max(...auxInts)
      }

      for (let i = 0; i < chartData.value[0].mzs.length; i++) {
        const xAxis = chartData.value[0].mzs[i]
        const auxInt = normalization.value ? (chartData.value[0].ints[i] / normalization.value)
          : chartData.value[0].ints[i]
        const yAxis =
          state.scaleIntensity
            ? auxInt / maxIntensity * 100.0 : auxInt
        let tooltip = `m/z: ${xAxis.toFixed(4)}`
        let isAnnotated = false

        if (!minX || xAxis < minX) {
          minX = xAxis
        }
        if (!maxX || xAxis > maxX) {
          maxX = xAxis
        }
        // check if is annotated
        let hasCompoundsHeader = false
        annotatedTheoreticalMzs.forEach((annotation: any) => {
          const theoreticalMz : number = annotation.mz
          const highestMz = theoreticalMz * 1.000003
          const lowestMz = theoreticalMz * 0.999997
          if (xAxis >= lowestMz && xAxis <= highestMz) {
            isAnnotated = true

            if (annotation.possibleCompounds.length > 0 && !hasCompoundsHeader) {
              tooltip += '<br>Candidate molecules: <br>'
              hasCompoundsHeader = true
            }

            annotation.possibleCompounds.forEach((compound: any) => {
              tooltip += compound.name + '<br>'
            })
          }
        })

        if (peakFilter.value !== PEAK_FILTER.FDR && !isAnnotated) { // add unnanotated peaks
          data.push({
            name: xAxis.toFixed(4),
            tooltip,
            mz: xAxis,
            value: [xAxis, yAxis],
            itemStyle: {
              color: isAnnotated ? 'blue' : 'red',
            },
          })

          markPointData.push({
            label: tooltip,
            mz: xAxis,
            xAxis: xAxis,
            yAxis: yAxis,
            itemStyle: {
              color: isAnnotated ? 'blue' : 'red',
            },
          })
        }

        if (peakFilter.value !== PEAK_FILTER.OFF && isAnnotated) {
          data.push({
            name: xAxis.toFixed(4),
            tooltip,
            mz: xAxis,
            value: [xAxis, yAxis],
            itemStyle: {
              color: isAnnotated ? 'blue' : 'red',
            },
          })

          markPointData.push({
            label: tooltip,
            mz: xAxis,
            xAxis: xAxis,
            yAxis: yAxis,
            itemStyle: {
              color: isAnnotated ? 'blue' : 'red',
            },
          })
        }
      }

      auxOptions.xAxis.min = minX
      auxOptions.xAxis.max = maxX
      auxOptions.yAxis.name = state.scaleIntensity ? 'Relative Intensity' : 'Intensity'
      auxOptions.yAxis.max = state.scaleIntensity ? 100 : maxIntensity
      auxOptions.series[0].markPoint.data = markPointData
      auxOptions.series[0].data = data
      // handleZoomReset()
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
