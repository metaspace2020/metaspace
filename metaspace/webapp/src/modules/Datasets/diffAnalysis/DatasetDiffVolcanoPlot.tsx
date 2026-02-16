import { computed, defineComponent, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { ScatterChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  GraphicComponent,
} from 'echarts/components'
import { ElIcon } from '../../../lib/element-plus'
import { Loading } from '@element-plus/icons-vue'
import './DatasetDiffVolcanoPlot.scss'

use([
  CanvasRenderer,
  ScatterChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  GraphicComponent,
])

interface DatasetDiffVolcanoPlotProps {
  data: any[]
  isLoading: boolean
  selectedAnnotation?: any
}

interface DatasetDiffVolcanoPlotState {
  chartOptions: any
  size: number
}

const roiShapes = ['circle']

export const DatasetDiffVolcanoPlot = defineComponent({
  name: 'DatasetDiffVolcanoPlot',
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
  },
  emits: ['annotationSelected'],
  setup(props: DatasetDiffVolcanoPlotProps, { emit }) {
    const volcanoChart = ref(null)

    const state = reactive<DatasetDiffVolcanoPlotState>({
      size: 500,
      chartOptions: {
        grid: {
          top: 70,
          left: 100,
          right: 60,
          bottom: 90,
          containLabel: true,
        },
        toolbox: {
          feature: {
            saveAsImage: {
              title: ' ',
              name: 'volcano_plot',
            },
          },
        },
        tooltip: {
          trigger: 'item',
          formatter: function (params: any) {
            if (!params || !params.data || params.data.length < 7) return 'No data'
            const lfc = params.data[0]
            const auc = params.data[1]
            const metabolite = params.data[4]
            const roi = params.data[5]
            const annotation = params.data[6]

            return `<strong>${metabolite}</strong><br/>log₂FC: ${lfc?.toFixed(3) || 'N/A'}<br/>Scaled AUC: ${
              auc?.toFixed(3) || 'N/A'
            }<br/>ROI: ${roi}<br/>m/z: ${annotation?.mz?.toFixed(4) || 'N/A'}`
          },
        },
        legend: {
          top: 10,
          selectedMode: true,
          itemWidth: 18,
          itemHeight: 18,
          data: [],
        },
        graphic: [
          {
            type: 'group',
            left: 'center',
            top: 45,
            children: [
              { type: 'text', left: 95, style: { text: '■', fill: '#d73027', font: '16px Arial' } },
              {
                type: 'text',
                left: 110,
                style: { text: ' upregulated', font: '12px Arial', fill: '#333' },
              },
              { type: 'text', left: 250, style: { text: '■', fill: '#4575b4', font: '16px Arial' } },
              {
                type: 'text',
                left: 265,
                style: { text: ' downregulated', font: '12px Arial', fill: '#333' },
              },
            ],
          },
        ],
        xAxis: {
          name: 'log₂(Fold change)',
          nameLocation: 'middle',
          nameGap: 45,
          min: -2,
          max: 2,
          splitLine: {
            lineStyle: { type: 'dashed', color: '#e0e0e0' },
          },
          axisLine: {
            lineStyle: { color: '#666' },
          },
        },
        yAxis: {
          name: 'Scaled AUC',
          nameLocation: 'middle',
          nameGap: 60,
          min: -1,
          max: 1,
          splitLine: {
            lineStyle: { type: 'dashed', color: '#e0e0e0' },
          },
          axisLine: {
            lineStyle: { color: '#666' },
          },
          axisLabel: {
            formatter: function (value: number) {
              return value.toFixed(2)
            },
          },
        },
        series: [],
      },
    })

    const chartData = computed(() => props.data)

    const processedData = computed(() => {
      if (!chartData.value || chartData.value.length === 0) {
        return { rois: [], series: [] }
      }

      // Transform data to match expected format
      const rawData = chartData.value
        .filter((item: any) => item && item.annotation) // Filter out invalid items
        .map((item: any) => [
          typeof item.lfc === 'number' ? item.lfc : 0, // log2FC
          typeof item.auc === 'number' ? item.auc : 0, // AUC
          typeof item.lfc === 'number' ? item.lfc : 0, // log2FC (for symbolSize)
          typeof item.auc === 'number' ? item.auc : 0, // AUC (for symbolSize)
          item.annotation?.ion || item.annotation?.sumFormula || 'Unknown', // metabolite
          item.roi?.name || `ROI ${item.roi?.id || 'Unknown'}`, // ROI name
          item.annotation, // full annotation object
        ])

      // Get unique ROIs
      const rois = Array.from(new Set(rawData.map((d) => d[5])))

      // Define different shapes for each ROI

      // Create series for each ROI (similar to DashboardScatterChart)
      const series = rois.map((roi, index) => ({
        name: roi,
        type: 'scatter',
        symbol: roiShapes[index % roiShapes.length],
        symbolSize: function (val: any) {
          if (!val || val.length < 7) return 8
          const annotation = val[6]
          const isSelected =
            props.selectedAnnotation && annotation && annotation.id === props.selectedAnnotation.annotation?.id
          return isSelected ? 12 : 8
        },
        data: rawData.filter((d) => d[5] === roi),
        itemStyle: {
          borderColor: function (params: any) {
            if (!params || !params.data || params.data.length < 7) return '#666'
            const annotation = params.data[6]
            const isSelected =
              props.selectedAnnotation && annotation && annotation.id === props.selectedAnnotation.annotation?.id
            return isSelected ? '#000' : '#666'
          },
          borderWidth: function (params: any) {
            if (!params || !params.data || params.data.length < 7) return 1
            const annotation = params.data[6]
            const isSelected =
              props.selectedAnnotation && annotation && annotation.id === props.selectedAnnotation.annotation?.id
            return isSelected ? 3 : 1
          },
          color: function (params: any) {
            if (!params || !params.data || params.data.length < 7) return '#4575b4'
            const fc = params.data[0] // lfc is at index 0
            const annotation = params.data[6]
            const baseColor = fc >= 0 ? '#d73027' : '#4575b4'

            const isSelected =
              props.selectedAnnotation && annotation && annotation.id === props.selectedAnnotation.annotation?.id

            return isSelected ? baseColor : baseColor + '80' // Add transparency for non-selected
          },
        },
      }))

      return { rois, series }
    })

    const chartOptions = computed(() => {
      const options = { ...state.chartOptions }
      const { rois, series } = processedData.value

      // Update legend data with corresponding shapes
      options.legend.data = rois.map((r, index) => ({
        name: r,
        icon: 'empty' + roiShapes[index % roiShapes.length],
      }))

      // Update series and add reference lines
      options.series = [
        ...series,
        {
          type: 'line',
          name: 'Scaled AUC = 0',
          data: [
            [options.xAxis.min, 0],
            [options.xAxis.max, 0],
          ],
          lineStyle: {
            type: 'dashed',
            color: '#999',
            width: 1,
          },
          symbol: 'none',
          silent: true,
          showInLegend: false,
          z: 1,
        },
      ]

      // Update axis ranges based on data
      if (series.length > 0) {
        const allData = series.flatMap((s) => s.data)
        if (allData.length > 0) {
          const lfcValues = allData.map((d) => d[0]).filter((v) => v != null)
          const aucValues = allData.map((d) => d[1]).filter((v) => v != null)

          if (lfcValues.length > 0) {
            const minLfc = Math.min(...lfcValues)
            const maxLfc = Math.max(...lfcValues)
            const padding = Math.max(Math.abs(minLfc), Math.abs(maxLfc)) * 1.2
            options.xAxis.min = -padding
            options.xAxis.max = padding
          }

          if (aucValues.length > 0) {
            const minAuc = Math.min(...aucValues)
            const maxAuc = Math.max(...aucValues)
            const padding = (maxAuc - minAuc) * 0.1
            options.yAxis.min = Math.max(-1, minAuc - padding)
            options.yAxis.max = Math.min(1, maxAuc + padding)
          }
        }
      }

      return options
    })

    const handleChartResize = () => {
      const chartRef: any = volcanoChart.value
      if (chartRef && chartRef.chart) {
        chartRef.chart.resize()
      }
    }

    const handleItemClick = (params: any) => {
      if (params && params.data && params.data.length >= 7 && params.data[6]) {
        emit('annotationSelected', params.data[6])
      }
    }

    onMounted(() => {
      window.addEventListener('resize', handleChartResize)
    })

    onUnmounted(() => {
      window.removeEventListener('resize', handleChartResize)
    })

    watch(chartData, () => {
      setTimeout(() => {
        handleChartResize()
      }, 100)
    })

    watch(
      () => props.selectedAnnotation,
      () => {
        // Force chart update when selection changes
        const chartRef: any = volcanoChart.value
        if (chartRef && chartRef.chart) {
          setTimeout(() => {
            chartRef.chart.setOption(chartOptions.value, { notMerge: true })
          }, 50)
        }
      }
    )

    const renderChart = () => {
      const { isLoading } = props

      return (
        <div class="volcano-chart-holder" style={{ height: `${state.size}px`, width: '100%' }}>
          {isLoading && (
            <div class="loader-holder">
              <div>
                <ElIcon class="is-loading">
                  <Loading />
                </ElIcon>
              </div>
            </div>
          )}
          {/* @ts-ignore */}
          <ECharts
            ref={volcanoChart}
            autoresize={true}
            onClick={handleItemClick}
            class="volcano-chart"
            style={{ height: `${state.size}px`, width: '100%' }}
            option={chartOptions.value}
          />
        </div>
      )
    }

    const renderEmptyState = () => {
      return (
        <div class="volcano-empty-state">
          <p class="text-gray-500 text-center">No data available for volcano plot</p>
          <p class="text-gray-400 text-sm text-center">
            Select ROIs and apply filters to see differential analysis results
          </p>
        </div>
      )
    }

    return () => {
      const { data, isLoading } = props
      const hasData = data && data.length > 0

      return <div class="dataset-diff-volcano-plot">{hasData || isLoading ? renderChart() : renderEmptyState()}</div>
    }
  },
})
