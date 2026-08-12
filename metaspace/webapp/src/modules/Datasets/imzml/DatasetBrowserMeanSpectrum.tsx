import { computed, defineComponent, onMounted, onUnmounted, reactive, ref } from 'vue'
// @ts-ignore
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, ToolboxComponent, DataZoomComponent } from 'echarts/components'
import './DatasetBrowserMeanSpectrum.scss'
import { ElIcon } from '../../../lib/element-plus'
import { Loading } from '@element-plus/icons-vue'

use([SVGRenderer, BarChart, LineChart, GridComponent, TooltipComponent, ToolboxComponent, DataZoomComponent])

interface DatasetBrowserMeanSpectrumState {
  scaleIntensity: boolean
  chartOptions: any
}

export const DatasetBrowserMeanSpectrum = defineComponent({
  name: 'DatasetBrowserMeanSpectrum',
  props: {
    isEmpty: {
      type: Boolean,
      default: true,
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
    // [mz, intensity, support] triples, already sorted by m/z
    data: {
      type: Array,
      default: () => [],
    },
    stat: {
      type: String,
      default: 'MEAN',
    },
    emptyMessage: {
      type: String,
      default: '',
    },
  },
  setup(props, { emit }) {
    const meanSpectrumChart = ref(null)
    const state = reactive<DatasetBrowserMeanSpectrumState>({
      scaleIntensity: false,
      chartOptions: {
        grid: {
          top: 40,
          bottom: 80,
          left: '10%',
          right: '10%',
        },
        animation: false,
        tooltip: {
          show: true,
          formatter: (value: any) => value.data.tooltip,
        },
        toolbox: {
          right: 20,
          feature: {
            myTool1: {
              show: true,
              title: 'Restore',
              icon:
                'path://M512 981.333333c-209.866667 0-396.693333-126.026667-466.293333-314.08a35.52 35.52 0 0 1 ' +
                '23.626666-44.426666 38.613333 38.613333 0 0 1 48 20.693333c58.666667 158.933333 217.013333 ' +
                '265.493333 394.666667 265.6s336-106.666667 394.666667-266.133333a37.6 37.6 0 0 1 ' +
                '28.853333-23.626667 38.986667 38.986667 0 0 1 35.786667 11.946667 34.773333 34.773333 ' +
                '0 0 1 7.146666 35.36c-69.386667 188.373333-256.48 314.666667-466.453333 314.666666z ' +
                'm431.36-574.08a37.92 37.92 0 0 1-35.946667-24.266666C849.386667 222.56 690.613333 114.88 ' +
                '512 114.72S174.72 222.346667 116.746667 382.773333A38.72 38.72 0 0 1 69.333333 403.733333a35.786667 ' +
                '35.786667 0 0 1-24.106666-44.373333C113.333333 169.866667 301.013333 42.666667 512 ' +
                '42.666667s398.666667 127.306667 467.146667 316.96a34.56 34.56 0 0 1-4.906667 32.64 ' +
                '38.933333 38.933333 0 0 1-30.88 14.986666z',
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
              icon:
                'path://M6 2h6v6c0 1.1.9 2 2 2h6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4c0-1.1.9-2 2-2zm2 11a1 ' +
                '1 0 0 0 0 2h8a1 1 0 0 0 0-2H8zm0 4a1 1 0 0 0 0 2h4a1 1 0 0 0 0-2H8z ',
              onclick: () => {
                emit('download')
              },
            },
            saveAsImage: {
              title: 'Download',
              name: 'mean_spectrum',
            },
          },
        },
        xAxis: {
          name: 'm/z',
          splitLine: { show: false },
          nameLocation: 'center',
          nameGap: 20,
          nameTextStyle: {
            fontWeight: 'bold',
            fontSize: 14,
          },
          type: 'value',
        },
        yAxis: {
          name: 'Mean intensity',
          splitLine: { show: false },
          triggerEvent: true,
          nameLocation: 'center',
          nameGap: 60,
          nameTextStyle: {
            fontWeight: 'bold',
            fontSize: 14,
          },
          type: 'value',
          axisLabel: {
            formatter: (value: any) => (state.scaleIntensity ? value : value.toExponential(2)),
          },
          boundaryGap: [0, '30%'],
        },
        dataZoom: [
          { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
          { type: 'slider', yAxisIndex: 0, filterMode: 'none', right: 16 },
          { type: 'slider', xAxisIndex: 0, filterMode: 'none' },
        ],
        series: [
          {
            name: 'Mean spectrum',
            type: 'bar',
            // Unlike the single-pixel Mass spectrum view, this is a single series: a
            // region spectrum has no inherent link to any database or FDR result, so
            // there is no annotated/unannotated split to colour by.
            data: [],
            large: true,
            barWidth: 1,
            itemStyle: {
              color: '#005AB5',
            },
          },
        ],
      },
    })

    const maxIntensity = computed(() => (props.data.length ? Math.max(...props.data.map((d: any) => d[1])) : 0))

    const statLabel = computed(() => (props.stat === 'SUM' ? 'Summed intensity' : 'Mean intensity'))

    const chartOptions = computed(() => {
      const auxOptions = state.chartOptions
      const scale = state.scaleIntensity && maxIntensity.value > 0 ? 100 / maxIntensity.value : 1

      auxOptions.series[0].data = props.data.map((d: any) => {
        const [mz, intensity, support] = d
        return {
          value: [mz, intensity * scale],
          mz,
          tooltip:
            `m/z: ${mz.toFixed(4)}<br>` +
            `${statLabel.value}: ${intensity.toExponential(3)}<br>` +
            `Pixels: ${support}`,
        }
      })

      auxOptions.yAxis.name = state.scaleIntensity ? `Relative ${statLabel.value.toLowerCase()}` : statLabel.value
      auxOptions.yAxis.max = state.scaleIntensity ? 100 : undefined
      return auxOptions
    })

    const handleChartResize = () => {
      if (meanSpectrumChart.value) {
        // @ts-ignore
        meanSpectrumChart.value.chart.resize()
      }
    }

    onMounted(() => {
      window.addEventListener('resize', handleChartResize)
    })

    onUnmounted(() => {
      window.removeEventListener('resize', handleChartResize)
    })

    const handleZoomReset = () => {
      if (meanSpectrumChart.value) {
        // @ts-ignore
        meanSpectrumChart.value.chart.dispatchAction({
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
        // The intensity-weighted centroid, not the most intense raw peak. Goes into the
        // existing manual m/z entry path, so the ion image uses the user's own ppm.
        emit('itemSelected', item.data.mz)
      }
    }

    const renderSpectrum = () => {
      const { isLoading } = props

      return (
        <div class="chart-holder">
          {isLoading && (
            <div class="loader-holder">
              <div>
                <ElIcon class="is-loading">
                  <Loading />
                </ElIcon>
              </div>
            </div>
          )}
          <ECharts
            ref={meanSpectrumChart}
            class="chart"
            autoResize={true}
            {...{ 'onZr:dblclick': handleZoomReset }}
            onClick={handleItemSelect}
            option={chartOptions.value}
          />
        </div>
      )
    }

    const renderEmpty = () => (
      <div class="dataset-browser-mean-spectrum-empty">
        <p class="text-sm text-gray-600">{props.emptyMessage}</p>
      </div>
    )

    return () => {
      const { isEmpty, isLoading } = props

      return (
        <div class="dataset-browser-mean-spectrum-container">
          {!isEmpty || isLoading ? renderSpectrum() : renderEmpty()}
        </div>
      )
    }
  },
})
