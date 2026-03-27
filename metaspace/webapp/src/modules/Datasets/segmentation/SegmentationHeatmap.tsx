import { computed, defineComponent, reactive, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { HeatmapChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  TitleComponent,
  VisualMapComponent,
  GraphicComponent,
} from 'echarts/components'
import { ElIcon } from '../../../lib/element-plus'
import { Loading } from '@element-plus/icons-vue'
import './SegmentationHeatmap.scss'

use([
  CanvasRenderer,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  TitleComponent,
  VisualMapComponent,
  GraphicComponent,
])

interface SegmentSummary {
  id: number
  size_px: number
  coverage_fraction: number
  top_ions: string[]
}

interface SegmentationData {
  algorithm: string
  map_type: string
  n_segments: number
  parameters_used: {
    n_components: number | null
    variance_threshold: number
    k: number
    k_range: number[]
    criterion: string
  }
  segment_summary: SegmentSummary[]
  diagnostics: {
    bic_curve: any
    explained_variance: number[]
    spatial_weights: any
  }
}

interface SegmentationHeatmapProps {
  segmentationData: SegmentationData
  isLoading: boolean
  isVisible?: boolean
  segmentations?: any[]
}

interface SegmentationHeatmapState {
  chartOptions: any
  size: number
}

export const SegmentationHeatmap = defineComponent({
  name: 'SegmentationHeatmap',
  props: {
    segmentationData: {
      type: Object as () => SegmentationData,
      required: true,
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
    isVisible: {
      type: Boolean,
      default: false,
    },
    segmentations: {
      type: Array as () => any[],
      default: () => [],
    },
  },
  emits: ['ionSelected'],
  setup(props: SegmentationHeatmapProps, { emit }) {
    const heatmapChart = ref(null)

    // Helper function to get segment name
    const getSegmentName = (segmentId: number) => {
      // const segmentation = props.segmentations.find((s: any) => s.segmentIndex === segmentId)
      return `Cluster ${segmentId}`
    }

    // Process segmentation data to create heatmap
    const processSegmentationData = (data: SegmentationData) => {
      if (!data || !data.segment_summary) {
        return { segments: [], ions: [], heatmapData: [] }
      }

      // Get all unique ions from all segments
      const allIons = new Set<string>()
      data.segment_summary.forEach((segment) => {
        segment.top_ions.slice(0, 10).forEach((ion) => allIons.add(ion)) // Top 10 ions per segment
      })

      const ions = Array.from(allIons)
      const segments = data.segment_summary.map((s) => getSegmentName(s.id))

      // Create heatmap data matrix:
      // [segmentIndex, ionIndex, coverageFraction, ionRank]
      const heatmapData: [number, number, number, number][] = []

      ions.forEach((ion, ionIndex) => {
        segments.forEach((segmentName, segmentIndex) => {
          const segment = data.segment_summary[segmentIndex]
          const ionRank = segment.top_ions.indexOf(ion)

          // Only render cells where the ion appears in this segment.
          // Cell color encodes coverage_fraction; label encodes ion rank.
          if (ionRank >= 0) {
            heatmapData.push([segmentIndex, ionIndex, segment.coverage_fraction, ionRank + 1])
          }
        })
      })

      return { segments, ions, heatmapData }
    }

    const processedData = computed(() => processSegmentationData(props.segmentationData))

    const state = reactive<SegmentationHeatmapState>({
      size: 600,
      chartOptions: {
        grid: {
          top: 80,
          left: 120,
          right: 80,
          bottom: 120,
        },
        toolbox: {
          feature: {
            saveAsImage: {
              title: 'Export to CSV',
              name: 'segmentation_heatmap',
            },
          },
          right: 20,
          top: 20,
        },
        tooltip: {
          position: 'top',
          formatter: (params: any) => {
            if (!params || !params.data || params.data.length < 4) return 'No data'
            const segmentIndex = params.data[0]
            const ionIndex = params.data[1]
            const ionRank = params.data[3]
            const segments = processedData.value?.segments
            const ions = processedData.value?.ions

            return `
              <strong>${ions[ionIndex] || 'Unknown'}</strong><br/>
              ${segments[segmentIndex] || 'Unknown'}<br/>
              Rank: #${ionRank}<br/>
            `
          },
        },
        xAxis: {
          type: 'category',
          data: [],
          position: 'bottom',
          axisLine: { show: true },
          axisTick: { show: true },
          axisLabel: {
            fontWeight: 'bold',
            rotate: 0,
          },
        },
        yAxis: {
          type: 'category',
          data: [],
          axisLine: { show: true },
          axisTick: { show: true },
          axisLabel: {
            fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
            fontSize: 11,
          },
        },
        visualMap: {
          // Heatmap points are [segmentIndex, ionIndex, coverageFraction, ionRank]
          // Force color mapping to use coverageFraction.
          dimension: 2,
          min: 0,
          max: 1,
          calculable: false,
          orient: 'horizontal',
          left: 'center',
          bottom: 20,
          inRange: {
            // Avoid white at the low end so low coverage remains visible.
            color: ['#74add1', '#4575b4', '#d73027'],
          },
          outOfRange: {
            color: '#f0f0f0',
          },
          text: ['High', 'Low'],
          textStyle: {
            fontSize: 12,
          },
        },
        graphic: [
          {
            type: 'text',
            left: 'center',
            bottom: 5,
            style: {
              text: 'Fold change',
              fill: '#666',
              fontSize: 12,
              fontWeight: 500,
            },
          },
        ],
        series: [
          {
            type: 'heatmap',
            data: [],
            itemStyle: {
              borderWidth: 1,
              borderColor: '#ffffff',
            },
            emphasis: {
              itemStyle: {
                borderColor: '#000',
                borderWidth: 2,
              },
            },
            label: {
              show: true,
              formatter: () => {
                return ''
              },
              color: '#fff',
              fontWeight: 'bold',
              fontSize: 10,
            },
          },
        ],
      },
    })

    // Update chart options when data changes
    watch(
      () => [props.segmentationData, props.segmentations],
      () => {
        const { segments, ions, heatmapData } = processedData.value
        const coverageValues = heatmapData.map((d) => d[2])
        const minCoverage = coverageValues.length ? Math.min(...coverageValues) : 0
        const maxCoverage = coverageValues.length ? Math.max(...coverageValues) : 1

        state.chartOptions = {
          ...state.chartOptions,
          visualMap: {
            ...state.chartOptions.visualMap,
            min: minCoverage,
            max: maxCoverage,
          },
          xAxis: {
            ...state.chartOptions.xAxis,
            data: segments,
          },
          yAxis: {
            ...state.chartOptions.yAxis,
            data: ions,
          },
          series: [
            {
              ...state.chartOptions.series[0],
              data: heatmapData,
            },
          ],
        }
      },
      { immediate: true }
    )

    // Handle chart click events
    const handleChartClick = (params: any) => {
      if (!params || !params.data || params.data.length < 3) return

      const ionIndex = params.data[1]
      const { ions } = processedData.value
      if (ions[ionIndex]) {
        emit('ionSelected', ions[ionIndex])
      }
    }

    // Handle resize when component becomes visible
    const resizeChart = () => {
      if (heatmapChart.value && heatmapChart.value.resize) {
        try {
          heatmapChart.value.resize()
        } catch (error) {
          console.debug('Chart resize failed, container may not be ready yet')
        }
      }
    }

    // Watch for visibility changes and resize chart
    watch(
      () => props.isVisible,
      (newVisible) => {
        if (newVisible) {
          nextTick(() => {
            setTimeout(() => resizeChart(), 100)
            setTimeout(() => resizeChart(), 300)
            setTimeout(() => resizeChart(), 500)
          })
        }
      }
    )

    // Resize on window resize
    const handleWindowResize = () => {
      resizeChart()
    }

    onMounted(() => {
      window.addEventListener('resize', handleWindowResize)
    })

    onUnmounted(() => {
      window.removeEventListener('resize', handleWindowResize)
    })

    const renderChart = () => {
      return (
        <div class="segmentation-heatmap">
          {props.isLoading ? (
            <div class="flex justify-center items-center h-96">
              <ElIcon class="is-loading text-4xl">
                <Loading />
              </ElIcon>
            </div>
          ) : (
            <div class="heatmap-container">
              {/* @ts-ignore */}
              <ECharts
                ref={heatmapChart}
                autoresize={true}
                onClick={handleChartClick}
                class="heatmap-chart"
                style={{ height: '500px', width: '100%' }}
                option={state.chartOptions}
              />
            </div>
          )}
        </div>
      )
    }

    const renderEmptyState = () => {
      return (
        <div class="heatmap-empty-state">
          <p class="text-gray-500 text-center">No segmentation results available</p>
          <p class="text-gray-400 text-sm text-center">Please run segmentation analysis first.</p>
        </div>
      )
    }

    return () => {
      const { segmentationData, isLoading } = props
      const hasData = segmentationData && segmentationData.segment_summary

      return <div class="segmentation-heatmap">{hasData || isLoading ? renderChart() : renderEmptyState()}</div>
    }
  },
})
