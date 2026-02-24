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
} from 'echarts/components'
import { ElIcon } from '../../../lib/element-plus'
import { Loading } from '@element-plus/icons-vue'
import './DatasetDiffHeatmap.scss'

use([
  CanvasRenderer,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  TitleComponent,
  VisualMapComponent,
])

interface DatasetDiffHeatmapProps {
  data: any[]
  isLoading: boolean
  selectedAnnotation?: any
  isVisible?: boolean
}

interface DatasetDiffHeatmapState {
  chartOptions: any
  size: number
}

interface HeatmapDataPoint {
  id: number
  roi: string
  annotation: any
  lfc: number
  auc: number
}

export const DatasetDiffHeatmap = defineComponent({
  name: 'DatasetDiffHeatmap',
  props: {
    data: {
      type: Array,
      default: () => [],
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
    selectedAnnotation: {
      type: Object,
      default: null,
    },
    isVisible: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['annotationSelected'],
  setup(props: DatasetDiffHeatmapProps, { emit }) {
    const heatmapChart = ref(null)

    // Process data to get top 5 annotations per ROI
    const processHeatmapData = (rawData: any[]) => {
      if (!rawData || rawData.length === 0) {
        return { rois: [], annotations: [], heatmapData: [] }
      }

      // Group data by ROI
      const roiGroups: { [key: string]: HeatmapDataPoint[] } = {}

      rawData.forEach((item) => {
        const roiName = item.roi?.name || 'Unknown ROI'
        if (!roiGroups[roiName]) {
          roiGroups[roiName] = []
        }
        roiGroups[roiName].push({
          id: parseInt(item.roi?.id, 10),
          roi: roiName,
          annotation: item.annotation,
          lfc: item.lfc,
          auc: item.auc,
        })
      })

      // Get top 5 annotations per ROI (by absolute LFC value)
      const topAnnotationsPerRoi: { [key: string]: HeatmapDataPoint[] } = {}
      Object.keys(roiGroups).forEach((roiName) => {
        const sortedAnnotations = roiGroups[roiName]
          .filter((item) => item.auc !== null && item.auc !== undefined)
          .sort((a, b) => Math.abs(b.auc) - Math.abs(a.auc))
        topAnnotationsPerRoi[roiName] = sortedAnnotations
      })

      // Collect all unique annotations from top 5s
      const allTopAnnotations: any[] = []
      const annotationIds = new Set()

      Object.values(topAnnotationsPerRoi).forEach((annotations) => {
        annotations.forEach((item) => {
          if (!annotationIds.has(item.annotation.id)) {
            annotationIds.add(item.annotation.id)
            allTopAnnotations.push(item.annotation)
          }
        })
      })

      const rois = Object.keys(roiGroups)
      const annotations = allTopAnnotations

      // Create heatmap data matrix
      const heatmapData: [number, number, number | null, number | null, number | null][] = []

      annotations.forEach((annotation, annotationIndex) => {
        rois.forEach((roiName, roiIndex) => {
          const roiData = topAnnotationsPerRoi[roiName] || []
          const matchingItem = roiData.find((item) => item.annotation.id === annotation.id)
          const lfc = matchingItem ? matchingItem.lfc : null
          const auc = matchingItem ? matchingItem.auc : null
          heatmapData.push([roiIndex, annotationIndex, matchingItem?.id, auc, lfc])
        })
      })

      return { rois, annotations, heatmapData }
    }

    const processedData = computed(() => processHeatmapData(props.data))

    const state = reactive<DatasetDiffHeatmapState>({
      size: 600,
      chartOptions: {
        title: {
          subtext: ' ',
          left: 'center',
          top: 10,
        },
        grid: {
          top: 60,
          left: 200,
          right: 80,
          bottom: 90,
        },
        toolbox: {
          feature: {
            saveAsImage: {
              title: ' ',
              name: 'diff_heatmap',
            },
          },
        },
        tooltip: {
          position: 'top',
          formatter: (params: any) => {
            if (!params || !params.data || params.data.length < 5) return 'No data'
            const roiIndex = params.data[0]
            const annotationIndex = params.data[1]
            const auc = params.data[3]
            const lfc = params.data[4]
            const rois = processedData.value?.rois
            const annotations = processedData.value?.annotations

            return `
              <strong>${annotations[annotationIndex]?.ion || 'Unknown'}</strong><br/>
              ROI: ${rois[roiIndex] || 'Unknown'}<br/>
              log₂FC: ${lfc?.toFixed(2)}<br/>
              AUC: ${auc?.toFixed(3)}<br/>
              m/z: ${annotations[annotationIndex]?.mz?.toFixed(4) || 'N/A'}
            `
          },
        },
        xAxis: {
          type: 'category',
          data: [],
          position: 'top',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            fontWeight: 'bold',
          },
        },
        yAxis: {
          type: 'category',
          data: [],
          axisLine: { show: false },
          axisTick: { show: false },
        },
        visualMap: {
          min: -4,
          max: 4,
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          bottom: 20,
          inRange: {
            color: ['#4575b4', '#e0e0e0', '#d73027'],
          },
          outOfRange: {
            color: '#e0e0e0',
          },
          text: ['Up', 'Down'],
        },
        graphic: [
          {
            type: 'text',
            left: 'center',
            bottom: 5,
            style: {
              text: 'log₂(Fold change)',
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
              borderWidth: 2,
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
              formatter: (params: any) => {
                const v = params.value[4]
                return v === null || v === undefined ? '–' : v.toFixed(3)
              },
              color: '#fff',
              fontWeight: 'bold',
            },
          },
        ],
      },
    })

    // Update chart options when data changes
    watch(
      () => props.data,
      () => {
        const { rois, annotations, heatmapData } = processedData.value
        const absMax = Math.max(...heatmapData.map((d) => Math.abs(d[4])))

        state.chartOptions = {
          ...state.chartOptions,
          visualMap: {
            ...state.chartOptions.visualMap,
            max: absMax,
            min: -absMax,
          },
          xAxis: {
            ...state.chartOptions.xAxis,
            data: rois,
          },
          yAxis: {
            ...state.chartOptions.yAxis,
            data: annotations.map((ann) => ann.ion || 'Unknown'),
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
      if (!params || !params.data || params.data.length < 5) return

      const annotationIndex = params.data[1]
      const { annotations } = processedData.value
      if (annotations[annotationIndex]) {
        emit('annotationSelected', annotations[annotationIndex], params.value[2])
      }
    }

    // Handle resize when component becomes visible
    const resizeChart = () => {
      if (heatmapChart.value && heatmapChart.value.resize) {
        try {
          heatmapChart.value.resize()
        } catch (error) {
          // Ignore resize errors - they usually happen when container is not ready
          console.debug('Chart resize failed, container may not be ready yet')
        }
      }
    }

    // Watch for visibility changes and resize chart
    watch(
      () => props.isVisible,
      (newVisible) => {
        if (newVisible) {
          // Use nextTick to ensure DOM is updated, then add a small delay for animation
          nextTick(() => {
            // Try multiple times with increasing delays to ensure the container is ready
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
        <div class="dataset-diff-heatmap">
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
                style={{ height: '600px', width: '100%' }}
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
          <p class="text-gray-500 text-center">No results found for the current selection</p>
          <p class="text-gray-400 text-sm text-center">Please re-adjust filters or ROI selection.</p>
        </div>
      )
    }

    return () => {
      const { data, isLoading } = props
      const hasData = data && data.length > 0

      return <div class="dataset-diff-heatmap">{hasData || isLoading ? renderChart() : renderEmptyState()}</div>
    }
  },
})
