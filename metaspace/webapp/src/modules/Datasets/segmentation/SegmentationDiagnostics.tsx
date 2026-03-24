import { computed, defineComponent, onMounted, onUnmounted, reactive, ref } from 'vue'
// @ts-ignore
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  DataZoomComponent,
} from 'echarts/components'
import { ElIcon } from '../../../lib/element-plus'
import { Loading } from '@element-plus/icons-vue'
import './SegmentationDiagnostics.scss'

use([
  CanvasRenderer,
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  DataZoomComponent,
])

interface SegmentationDiagnosticsProps {
  segmentationData: any
  isLoading?: boolean
}

interface SegmentationDiagnosticsState {
  bicChartOptions: any
  histogramChartOptions: any
}

export const SegmentationDiagnostics = defineComponent({
  name: 'SegmentationDiagnostics',
  props: {
    segmentationData: {
      type: Object,
      required: true,
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
  },
  setup(props: SegmentationDiagnosticsProps) {
    const bicChartRef = ref(null)
    const histogramChartRef = ref(null)

    const state = reactive<SegmentationDiagnosticsState>({
      bicChartOptions: {
        title: {
          text: 'GMM BIC Curve',
          left: 'center',
          top: 20,
          textStyle: {
            fontSize: 16,
            fontWeight: 'normal',
          },
        },
        grid: {
          left: '15%',
          right: '10%',
          top: '25%',
          bottom: '20%',
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          name: 'k',
          nameLocation: 'middle',
          nameGap: 30,
          data: [],
          splitLine: {
            show: true,
            lineStyle: {
              type: 'solid',
              color: '#e0e0e0',
            },
          },
        },
        yAxis: {
          type: 'value',
          name: 'BIC',
          nameLocation: 'middle',
          nameGap: 50,
          splitLine: {
            show: true,
            lineStyle: {
              type: 'solid',
              color: '#e0e0e0',
            },
          },
        },
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            const data = params[0]
            const k = data.name
            const bic = data.value
            return `k = ${k}<br/>BIC: ${bic.toLocaleString()}`
          },
        },
        series: [
          {
            name: 'BIC',
            type: 'line',
            data: [],
            lineStyle: {
              color: '#5470c6',
              width: 2,
            },
            symbol: 'circle',
            symbolSize: 6,
            itemStyle: {
              color: '#5470c6',
            },
          },
        ],
      },
      histogramChartOptions: {
        title: {
          text: 'Assignment confidence',
          left: 'center',
          top: 20,
          textStyle: {
            fontSize: 16,
            fontWeight: 'normal',
          },
        },
        grid: {
          left: '15%',
          right: '10%',
          top: '25%',
          bottom: '20%',
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          name: '',
          nameLocation: 'middle',
          nameGap: 30,
          data: [],
          splitLine: {
            show: true,
            lineStyle: {
              type: 'solid',
              color: '#e0e0e0',
            },
          },
        },
        yAxis: {
          type: 'log',
          name: 'Count (log scale)',
          nameLocation: 'middle',
          nameGap: 50,
          min: 1, // Start from 1 to avoid log(0)
          splitLine: {
            show: true,
            lineStyle: {
              type: 'solid',
              color: '#e0e0e0',
            },
          },
          axisLabel: {
            fontSize: 11,
            formatter: (value: number) => {
              if (value >= 1000) {
                return (value / 1000).toFixed(0) + 'K'
              }
              return value.toString()
            },
          },
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'shadow',
          },
          formatter: (params: any) => {
            const data = params[0]
            const binRange = data.name
            const count = data.value
            return `${binRange}<br/>Count: ${count.toLocaleString()}`
          },
        },
        series: [
          {
            name: 'Count',
            type: 'bar',
            data: [],
            barWidth: '80%',
            itemStyle: {
              color: '#5470c6',
            },
          },
        ],
      },
    })

    const bicChartOptions = computed(() => {
      if (!props.segmentationData?.diagnostics?.bic_curve) {
        return state.bicChartOptions
      }

      const bicCurve = props.segmentationData.diagnostics.bic_curve
      const selectedK = bicCurve.selected_k

      const updatedOptions = {
        ...state.bicChartOptions,
        xAxis: {
          ...state.bicChartOptions.xAxis,
          data: bicCurve.k_values,
        },
        yAxis: {
          ...state.bicChartOptions.yAxis,
          axisLabel: {
            fontSize: 11,
            formatter: (value: number) => {
              if (Math.abs(value) >= 1000000) {
                return (value / 1000000).toFixed(1) + 'M'
              } else if (Math.abs(value) >= 1000) {
                return (value / 1000).toFixed(0) + 'K'
              }
              return value.toString()
            },
          },
        },
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            const data = params[0]
            const k = data.name
            const bic = data.value
            return `k = ${k}<br/>BIC: ${bic.toLocaleString()}`
          },
        },
        series: [
          {
            ...state.bicChartOptions.series[0],
            data: bicCurve.scores,
            markLine: {
              symbol: ['none', 'none'],
              data: [
                {
                  xAxis: bicCurve.k_values.indexOf(selectedK),
                  lineStyle: {
                    color: '#ff4757',
                    type: 'dashed',
                    width: 2,
                  },
                  label: {
                    show: true,
                    position: 'end',
                    formatter: `${selectedK}`,
                    color: '#ff4757',
                    fontSize: 12,
                  },
                },
              ],
            },
          },
        ],
      }

      return updatedOptions
    })

    const histogramChartOptions = computed(() => {
      if (!props.segmentationData?.diagnostics?.assignment_confidence_histogram) {
        return state.histogramChartOptions
      }

      const histogram = props.segmentationData.diagnostics.assignment_confidence_histogram
      const { counts, bin_edges } = histogram

      // Filter out bins with zero counts for a cleaner histogram
      const nonZeroBins = []
      const nonZeroLabels = []
      let maxCount = 0
      let maxCountOriginalIndex = -1
      let maxCountFilteredIndex = -1

      for (let i = 0; i < counts.length; i++) {
        if (counts[i] > 0) {
          nonZeroBins.push({
            value: counts[i],
            originalIndex: i,
            binStart: bin_edges[i],
            binEnd: bin_edges[i + 1],
          })
          nonZeroLabels.push(bin_edges[i].toFixed(2))

          if (counts[i] > maxCount) {
            maxCount = counts[i]
            maxCountOriginalIndex = i
            maxCountFilteredIndex = nonZeroBins.length - 1
          }
        }
      }

      // Create histogram data with colors
      const histogramData = nonZeroBins.map((bin, index) => {
        let color = '#0F87EF' // Default blue

        // Highlight the bin with the highest count
        if (index === maxCountFilteredIndex) {
          color = '#F08A41' // Red for the most significant bin
        }

        return {
          value: bin.value,
          itemStyle: {
            color: color,
          },
        }
      })

      const updatedOptions = {
        ...state.histogramChartOptions,
        xAxis: {
          ...state.histogramChartOptions.xAxis,
          data: nonZeroLabels,
          axisLabel: {
            interval: 0, // Show all labels since we now have fewer bins
            rotate: 45,
            fontSize: 10,
          },
        },
        yAxis: {
          ...state.histogramChartOptions.yAxis,
          type: 'log',
          name: 'Count (log scale)',
          min: 1,
          axisLabel: {
            fontSize: 11,
            formatter: (value: number) => {
              if (value >= 1000) {
                return (value / 1000).toFixed(0) + 'K'
              }
              return value.toString()
            },
          },
        },
        series: [
          {
            ...state.histogramChartOptions.series[0],
            data: histogramData,
            markLine: {
              symbol: ['none', 'none'],
              data: [
                {
                  xAxis: maxCountFilteredIndex,
                  lineStyle: {
                    color: '#ff4757',
                    type: 'dashed',
                    width: 1,
                  },
                  label: {
                    show: true,
                    position: 'insideEndTop',
                    formatter: `${bin_edges[maxCountOriginalIndex].toFixed(2)}`,
                    color: '#ff4757',
                    fontSize: 10,
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    padding: [2, 4],
                    borderRadius: 3,
                  },
                },
              ],
            },
          },
        ],
      }

      return updatedOptions
    })

    const handleChartResize = () => {
      const bicChart: any = bicChartRef.value
      const histogramChart: any = histogramChartRef.value

      if (bicChart && bicChart.chart) {
        bicChart.resize()
      }
      if (histogramChart && histogramChart.chart) {
        histogramChart.resize()
      }
    }

    onMounted(() => {
      window.addEventListener('resize', handleChartResize)
    })

    onUnmounted(() => {
      window.removeEventListener('resize', handleChartResize)
    })

    return () => {
      if (props.isLoading) {
        return (
          <div class="segmentation-diagnostics-loading">
            <ElIcon class="is-loading">
              <Loading />
            </ElIcon>
            <p>Loading diagnostics...</p>
          </div>
        )
      }

      if (!props.segmentationData?.diagnostics) {
        return (
          <div class="segmentation-diagnostics-empty">
            <p class="text-gray-500">No diagnostics data available</p>
          </div>
        )
      }

      return (
        <div class="segmentation-diagnostics">
          {/* GMM BIC Curve Chart */}
          {props.segmentationData?.diagnostics?.bic_curve && (
            <div class="chart-container" style={{ height: '400px', width: '100%', marginBottom: '40px' }}>
              {/* @ts-ignore */}
              <ECharts
                ref={bicChartRef}
                autoresize={true}
                class="diagnostics-chart"
                style={{ height: '100%', width: '100%' }}
                option={bicChartOptions.value}
              />
            </div>
          )}

          {/* Assignment Confidence Histogram */}
          {props.segmentationData?.diagnostics?.assignment_confidence_histogram && (
            <div class="chart-container" style={{ height: '400px', width: '100%' }}>
              {/* @ts-ignore */}
              <ECharts
                ref={histogramChartRef}
                autoresize={true}
                class="diagnostics-chart"
                style={{ height: '100%', width: '100%' }}
                option={histogramChartOptions.value}
              />
            </div>
          )}
        </div>
      )
    }
  },
})
