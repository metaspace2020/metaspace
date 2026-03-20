import { computed, defineComponent, onMounted, onUnmounted, reactive, ref } from 'vue'
// @ts-ignore
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
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

// Predefined colors for segments (matching SegmentationVisualization)
const SEGMENT_COLORS = [
  '#5B9BD5', // Blue - Segment 0
  '#70AD47', // Green - Segment 1
  '#A5A5A5', // Gray - Segment 2
  '#FFC000', // Yellow - Segment 3
  '#C55A5A', // Red - Segment 4
  '#9966CC', // Purple - Segment 5
  '#FF9900', // Orange - Segment 6
  '#00B4D8', // Cyan - Segment 7
  '#FF6B9D', // Pink - Segment 8
  '#8FBC8F', // Sea Green - Segment 9
]

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, DataZoomComponent])

interface SegmentationDiagnosticsProps {
  segmentationData: any
  isLoading?: boolean
}

interface SegmentationDiagnosticsState {
  chartOptions: any
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
    const chartRef = ref(null)

    const state = reactive<SegmentationDiagnosticsState>({
      chartOptions: {
        title: {
          text: 'Segment Size Distribution',
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
          name: 'Segment ID',
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
          name: 'Number of Pixels',
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
          axisPointer: {
            type: 'shadow',
          },
          formatter: (params: any) => {
            const data = params[0]
            const segmentName = data.name
            const pixelCount = data.value
            const segmentData = data.data?.segmentData

            let tooltip = `${segmentName}<br/>Pixels: ${pixelCount.toLocaleString()}`
            if (segmentData) {
              tooltip += `<br/>Coverage: ${(segmentData.coverage_fraction * 100).toFixed(1)}%`
              if (segmentData.top_ions && segmentData.top_ions.length > 0) {
                tooltip += `<br/>Top ions: ${segmentData.top_ions.slice(0, 3).join(', ')}`
                if (segmentData.top_ions.length > 3) {
                  tooltip += ` (+${segmentData.top_ions.length - 3} more)`
                }
              }
            }
            return tooltip
          },
        },
        series: [
          {
            name: 'Segment Size',
            type: 'bar',
            data: [],
            barWidth: '60%',
          },
        ],
      },
    })

    const getSegmentColor = (segmentId: number) => {
      return SEGMENT_COLORS[segmentId % SEGMENT_COLORS.length]
    }

    const getSegmentName = (segmentId: number) => {
      return `Segment ${segmentId}`
    }

    const chartOptions = computed(() => {
      if (!props.segmentationData?.segment_summary) {
        return state.chartOptions
      }

      // Use the segment_summary data to create cluster chart
      const segmentSummary = props.segmentationData.segment_summary
      const totalPixels = segmentSummary.reduce((sum: number, segment: any) => sum + (segment.size_px || 0), 0)

      // Prepare data for the chart
      const segmentNames = segmentSummary.map((segment: any) => getSegmentName(segment.id))
      const segmentData = segmentSummary.map((segment: any) => ({
        value: segment.size_px,
        segmentData: segment,
        itemStyle: {
          color: getSegmentColor(segment.id),
        },
      }))

      // Calculate statistics
      const nSegments = segmentSummary.length
      const avgClusterSize = Math.round(totalPixels / nSegments)
      const largestCluster = Math.max(...segmentSummary.map((s: any) => s.size_px))
      const smallestCluster = Math.min(...segmentSummary.map((s: any) => s.size_px))

      const updatedOptions = {
        ...state.chartOptions,
        title: {
          ...state.chartOptions.title,
          text: 'Segment Size Distribution',
          subtext:
            `Total segments: ${nSegments} | Total pixels: ${totalPixels.toLocaleString()}\n` +
            `Average size: ${avgClusterSize.toLocaleString()} pixels | ` +
            `Range: ${smallestCluster.toLocaleString()} - ${largestCluster.toLocaleString()}`,
          subtextStyle: {
            fontSize: 11,
            color: '#666',
            lineHeight: 14,
          },
        },
        xAxis: {
          ...state.chartOptions.xAxis,
          data: segmentNames,
          axisLabel: {
            interval: 0,
            rotate: 0,
            fontSize: 11,
          },
        },
        yAxis: {
          ...state.chartOptions.yAxis,
          axisLabel: {
            fontSize: 11,
            formatter: (value: number) => {
              if (value >= 1000) {
                return (value / 1000).toFixed(1) + 'K'
              }
              return value.toString()
            },
          },
        },
        series: [
          {
            ...state.chartOptions.series[0],
            data: segmentData,
            barWidth: '60%',
          },
        ],
      }

      return updatedOptions
    })

    const handleChartResize = () => {
      const chart: any = chartRef.value
      if (chart && chart.chart) {
        chart.resize()
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

      if (!props.segmentationData?.segment_summary) {
        return (
          <div class="segmentation-diagnostics-empty">
            <p class="text-gray-500">No segmentation data available</p>
          </div>
        )
      }

      return (
        <div class="segmentation-diagnostics">
          <div class="chart-container" style={{ height: '550px', width: '100%' }}>
            {/* @ts-ignore */}
            <ECharts
              ref={chartRef}
              autoresize={true}
              class="diagnostics-chart"
              style={{ height: '100%', width: '100%' }}
              option={chartOptions.value}
            />
          </div>
        </div>
      )
    }
  },
})
