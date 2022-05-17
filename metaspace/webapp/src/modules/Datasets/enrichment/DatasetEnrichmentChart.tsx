import { computed, defineComponent, onMounted, onUnmounted, reactive, ref } from '@vue/composition-api'
// @ts-ignore
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import {
  CanvasRenderer,
} from 'echarts/renderers'
import {
  BarChart,
  LineChart,
  CustomChart,
} from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
  VisualMapComponent,
  MarkLineComponent,
} from 'echarts/components'
import './DatasetEnrichmentChart.scss'
import createColormap from '../../../lib/createColormap'
import { uniq } from 'lodash-es'

use([
  CanvasRenderer,
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
  VisualMapComponent,
  MarkLineComponent,
  CustomChart,
])

interface DatasetEnrichmentChartProps {
  isEmpty: boolean
  isLoading: boolean
  isDataLoading: boolean
  data: any[]
  annotatedData: any[]
  peakFilter: number
}

interface DatasetEnrichmentChartState {
  chartOptions: any
  size: number
}

export const DatasetEnrichmentChart = defineComponent<DatasetEnrichmentChartProps>({
  name: 'DatasetEnrichmentChart',
  props: {
    isEmpty: {
      type: Boolean,
      default: false,
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
  },
  setup(props, { emit }) {
    const spectrumChart = ref(null)

    const state = reactive<DatasetEnrichmentChartState>({
      size: 600,
      chartOptions: {
        grid: { containLabel: true },
        xAxis: {
          name: 'overrepresentation in dataset vs. database',
          bottom: 'center',
          nameLocation: 'middle',
          nameGap: 40,
          splitLine: {
            show: true,
          },
        },
        yAxis: {
          type: 'category',
          data: [],
          name: '-10LogPvalue',
          nameLocation: 'middle',
          nameTextStyle: {
            fontSize: 13,
            padding: [0, 30, -820, 0],
          },
          splitLine: {
            show: true,
          },
        },
        visualMap: {
          orient: 'vertical',
          min: 0,
          right: 'right',
          top: 'center',
          max: 10,
          text: ['10', '0'],
          dimension: 2,
          seriesIndex: 0,
          padding: 20,
          inRange: {
            color: ['#65B581', '#FFCE34', '#FD665F'],
          },
        },
        series: [
          {
            type: 'bar',
            name: 'bar',
            data: [],
            itemStyle: {
              color: '#77bef7',
            },
            markLine: {
              symbolSize: 0,
              label: { show: false },
              data: [{ xAxis: 1, name: 'Avg' }],
            },
          },
          {
            type: 'custom',
            name: 'error',
            itemStyle: {
              borderWidth: 1.5,
            },
            renderItem: (params : any, api : any) => {
              var xValue = api.value(0)
              var highPoint = api.coord([api.value(1), xValue])
              var lowPoint = api.coord([api.value(2), xValue])
              var halfWidth = api.size([1, 0])[0] * 0.05
              var style = api.style({
                stroke: 'black',
                fill: undefined,
              })
              return {
                type: 'group',
                children: [
                  {
                    type: 'line',
                    transition: ['shape'],
                    shape: {
                      x1: highPoint[0],
                      y1: highPoint[1] - halfWidth,
                      x2: highPoint[0],
                      y2: highPoint[1] + halfWidth,
                    },
                    style: style,
                  },
                  {
                    type: 'line',
                    transition: ['shape'],
                    shape: {
                      x1: highPoint[0],
                      y1: highPoint[1],
                      x2: lowPoint[0],
                      y2: lowPoint[1],
                    },
                    style: style,
                  },
                  {
                    type: 'line',
                    transition: ['shape'],
                    shape: {
                      x1: lowPoint[0],
                      y1: lowPoint[1] - halfWidth,
                      x2: lowPoint[0],
                      y2: lowPoint[1] + halfWidth,
                    },
                    style: style,
                  },
                ],
              }
            },
            data: [],
            z: 100,
          },
        ],
      },
    })

    const chartData = computed(() => props.data)
    const chartOptions = computed(() => {
      if (!chartData.value || (Array.isArray(chartData.value) && chartData.value.length === 0)) {
        return state.chartOptions
      }

      let maxX : number = 0
      const barData : any = []
      const chartOptions = state.chartOptions
      const categoryData : string[] = []
      const errorData : any = []
      const rawData : any = chartData.value
      let colormap : any = '-Viridis'
      let colorSteps : number = 1
      const colors : any = []

      if (!Array.isArray(colormap)) {
        colormap = createColormap(colormap).map((color: any) => {
          return `rgba(${color.join(',')})`
        })
      }

      rawData
        .reverse()
        .forEach((item: any, index: number) => {
          const intensity : number = item.qValue === 0 ? 0 : Math.min(10, -Math.log10(item.qValue))

          categoryData.push(item.name)
          errorData.push([
            index,
            item.median - item.std,
            item.median + item.std,
          ])
          barData.push([item.median, index, intensity])

          if (item.median + item.std > maxX) {
            maxX = item.median + item.std
          }
        })

      const availableAggregations = uniq(barData.map((item: any) => item[2])).sort()
      colorSteps = availableAggregations.length
        ? (colormap.length / availableAggregations.length) : 1
      availableAggregations.forEach((agg: any, aggIndex: number) => {
        colors.push(colormap[Math.floor(aggIndex * colorSteps)])
        return {
          label: agg,
          value: agg,
        }
      })

      const newSize = categoryData.length * 30
      state.size = newSize < 600 ? 600 : newSize
      chartOptions.yAxis.data = categoryData
      chartOptions.xAxis.max = maxX
      chartOptions.series[0].data = barData
      chartOptions.series[1].data = errorData
      chartOptions.visualMap.inRange.color = colors
      setTimeout(() => { handleChartResize() }, 100)

      return chartOptions
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
        console.log('item')
      } else {
        emit('itemSelected', item.data.mz)
      }
    }

    const renderEmptySpectrum = () => {
      return (
        <div class='dataset-browser-empty-spectrum'>
          <i class="el-icon-info info-icon mr-6"/>
          <div class='flex flex-col text-xs w-3/4'>
            <p class='font-semibold mb-2'>Steps:</p>
            <p>1 - Select a pixel on the image viewer</p>
            <p>2 - Apply the filter you desire</p>
            <p>3 - The interaction is multi-way, so you can also update the ion image via spectrum interaction</p>
          </div>
        </div>
      )
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
      const { isEmpty, isLoading } = props

      return (
        <div class={'dataset-browser-spectrum-container'}>
          {
            isEmpty && !isLoading
            && renderEmptySpectrum()
          }
          {
            (!isEmpty || isLoading)
            && renderSpectrum()
          }
        </div>
      )
    }
  },
})
