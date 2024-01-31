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
import getColorScale from '../../../lib/getColorScale'

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
  filename: string
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
    filename: {
      type: String,
      default: 'Enrichment_LION.png',
    },
  },
  setup(props, { emit }) {
    const spectrumChart = ref(null)

    const state = reactive<DatasetEnrichmentChartState>({
      size: 600,
      chartOptions: {
        grid: { containLabel: false, width: '70%', right: '7%', top: '2%', bottom: '20%' },
        xAxis: {
          name: '{a|Median}\nOverrepresentation in dataset vs. database',
          bottom: 'center',
          nameLocation: 'middle',
          nameGap: 20,
          splitLine: {
            show: true,
          },
          nameTextStyle: {
            rich: {
              a: {
                fontWeight: 'bold',
              },
            },
          },
        },
        toolbox: {
          feature: {
            saveAsImage: {
              title: ' ',
            },
          },
        },
        yAxis: {
          type: 'category',
          triggerEvent: true,
          data: [],
          splitLine: {
            show: true,
          },
          axisLabel: {
            fontSize: 12,
            overflow: 'break',
            width: 140,
            fontStyle: '400',
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
          formatter: function(value: any) {
            return value.toFixed(2)
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
            label: {
              show: true,
              position: 'inside',
              formatter: (params: any) => {
                return `n=${params?.data?.label?.n}`
              },
            },
            // markLine: {
            //   symbolSize: 0,
            //   label: { show: false },
            //   data: [{ xAxis: 1, name: 'Avg' }],
            // },
            barWidth: 20,
          },
          {
            type: 'custom',
            name: 'error',
            itemStyle: {
              borderWidth: 1.5,
            },
            renderItem: (params : any, api : any) => {
              const xValue = api.value(0)
              const highPoint = api.coord([api.value(1), xValue])
              const lowPoint = api.coord([api.value(2), xValue])
              const halfWidth = 4 // api.size([1, 0])[0] * 0.04
              const style = api.style({
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
          barData.push({ value: [item.median, index, intensity], label: item })

          if (item.median + item.std > maxX) {
            maxX = Math.ceil(item.median + item.std)
          }
        })

      const newSize = categoryData.length * 30
      state.size = newSize < 600 ? 600 : newSize
      chartOptions.yAxis.data = categoryData
      chartOptions.xAxis.max = maxX
      chartOptions.series[0].data = barData
      chartOptions.series[1].data = errorData
      chartOptions.visualMap.inRange.color = getColorScale('-Viridis').range
      chartOptions.toolbox.feature.saveAsImage.name = props.filename
      setTimeout(() => { handleChartResize() }, 100)

      return chartOptions
    })

    const handleChartResize = () => {
      const chartRef : any = spectrumChart.value
      if (chartRef && chartRef.chart) {
        chartRef.resize()
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
      if (item.targetType === 'axisLabel' && item.componentType === 'yAxis') {
        const itemClicked = chartData.value.find((dataItem: any) => dataItem.name === item.value)
        emit('itemSelected', itemClicked)
      } else if (item.componentType === 'series' && item.componentSubType === 'bar' && item.data?.label?.termId) {
        emit('itemSelected', { termId: item.data?.label?.termId })
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
        <div class='chart-holder relative'
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
          <span class='heat-text'>-10log10Pvalue</span>
        </div>
      )
    }

    return () => {
      const { isEmpty, isLoading } = props

      return (
        <div class={'dataset-enrichment-chart-container'}>
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
