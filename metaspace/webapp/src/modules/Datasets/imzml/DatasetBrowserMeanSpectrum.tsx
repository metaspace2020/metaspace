import { computed, defineComponent, nextTick, onMounted, onUnmounted, PropType, reactive, ref, watch } from 'vue'
// @ts-ignore
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import type { EChartsType } from 'echarts/core'
import type { DefaultLabelFormatterCallbackParams } from 'echarts'
import type { ElementEvent } from 'zrender'
import { SVGRenderer } from 'echarts/renderers'
import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, ToolboxComponent, DataZoomComponent } from 'echarts/components'
import './DatasetBrowserMeanSpectrum.scss'
import { ElIcon } from '../../../lib/element-plus'
import { Loading } from '@element-plus/icons-vue'
import {
  countPeaksInRange,
  findPeakIndex,
  formatPeakTooltip,
  lowerBound,
  MeanSpectrumPeak,
} from './meanSpectrumPeakLookup'

const HIT_TOLERANCE_PX = 5
const MARKER_SIZE = 10
const MAX_MARKED_PEAKS = 300
const TOOLTIP_OFFSET_PX = 12
// zrender fires two clicks before a dblclick, so a click only counts once no dblclick followed it.
const DBLCLICK_GRACE_MS = 250
// Stable empty array: assigning the same reference does not trigger vue-echarts' option watcher.
const NO_MARKERS: number[][] = []

use([SVGRenderer, BarChart, LineChart, ScatterChart, GridComponent, ToolboxComponent, DataZoomComponent])

interface XAxisModel {
  axis: { scale: { getExtent(): [number, number] } }
}

interface DatasetBrowserMeanSpectrumState {
  chartOptions: any
  hover?: { style: Record<string, string>; html: string }
  // Index range of the peaks inside the current x zoom; undefined until the chart reports it.
  visible?: [number, number]
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
      type: Array as PropType<MeanSpectrumPeak[]>,
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
    const meanSpectrumChart = ref<{ chart?: EChartsType } | null>(null)
    const state = reactive<DatasetBrowserMeanSpectrumState>({
      chartOptions: {
        grid: {
          top: 40,
          bottom: 80,
          left: '10%',
          right: '10%',
        },
        animation: false,
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
          nameLocation: 'center',
          nameGap: 60,
          nameTextStyle: {
            fontWeight: 'bold',
            fontSize: 14,
          },
          type: 'value',
          axisLabel: {
            formatter: (value: number) => value.toExponential(2),
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
            silent: true,
            barWidth: 2,
            itemStyle: {
              color: '#005AB5',
            },
          },
          {
            name: 'Peak markers',
            type: 'scatter',
            data: [],
            silent: true,
            symbol: 'circle',
            symbolSize: MARKER_SIZE,
            itemStyle: {
              color: '#005AB5',
            },
            label: {
              show: true,
              position: 'top',
              formatter: (params: DefaultLabelFormatterCallbackParams) => (params.value as number[])[0].toFixed(4),
            },
            labelLayout: {
              hideOverlap: true,
            },
          },
        ],
      },
    })

    const statLabel = computed(() => (props.stat === 'SUM' ? 'Summed intensity' : 'Mean intensity'))

    const points = computed(() => props.data.map(([mz, intensity]) => [mz, intensity]))

    // Markers and labels only for a sparse view, and only for the peaks actually in view:
    // laying out 20k labels on every zoom tick is what makes dense spectra freeze.
    const markerPoints = computed(() => {
      const [start, end] = state.visible ?? [0, props.data.length]
      return end - start <= MAX_MARKED_PEAKS ? points.value.slice(start, end) : NO_MARKERS
    })

    watch(
      [points, markerPoints, statLabel],
      ([bars, markers, name]) => {
        state.chartOptions.series[0].data = bars
        state.chartOptions.series[1].data = markers
        state.chartOptions.yAxis.name = name
      },
      { immediate: true }
    )

    const getChart = (): EChartsType | undefined => meanSpectrumChart.value?.chart

    const handleChartResize = () => {
      getChart()?.resize()
    }

    const updateVisibleRange = () => {
      const chart = getChart()
      if (!chart) {
        return
      }
      const axisModel = chart.getModel().getComponent('xAxis', 0) as unknown as XAxisModel | undefined
      if (!axisModel) {
        return
      }
      const [low, high] = axisModel.axis.scale.getExtent()
      const start = lowerBound(props.data, low)
      const end = start + countPeaksInRange(props.data, low, high)
      if (!state.visible || state.visible[0] !== start || state.visible[1] !== end) {
        state.visible = [start, end]
      }
    }

    watch(
      () => props.data,
      () => {
        state.visible = undefined
        nextTick(updateVisibleRange)
      }
    )

    let pendingClick: ReturnType<typeof setTimeout> | undefined

    const cancelPendingClick = () => {
      if (pendingClick !== undefined) {
        clearTimeout(pendingClick)
        pendingClick = undefined
      }
    }

    onMounted(() => {
      window.addEventListener('resize', handleChartResize)
    })

    onUnmounted(() => {
      window.removeEventListener('resize', handleChartResize)
      cancelPendingClick()
    })

    const handleZoomReset = () => {
      cancelPendingClick()
      getChart()?.dispatchAction({
        type: 'dataZoom',
        start: 0,
        end: 100,
      })
    }

    const peakAtPointer = (event: ElementEvent): MeanSpectrumPeak | undefined => {
      const chart = getChart()
      if (!chart) {
        return undefined
      }
      const { offsetX, offsetY } = event
      if (!chart.containPixel('grid', [offsetX, offsetY])) {
        return undefined
      }
      const [mz] = chart.convertFromPixel({ gridIndex: 0 }, [offsetX, offsetY])
      const [mzNear] = chart.convertFromPixel({ gridIndex: 0 }, [offsetX + HIT_TOLERANCE_PX, offsetY])
      const isHit = ([peakMz, intensity]: MeanSpectrumPeak) => {
        const [peakX, peakY] = chart.convertToPixel({ gridIndex: 0 }, [peakMz, intensity])
        const [, baselineY] = chart.convertToPixel({ gridIndex: 0 }, [peakMz, 0])
        return (
          Math.abs(peakX - offsetX) <= HIT_TOLERANCE_PX &&
          offsetY >= peakY - MARKER_SIZE / 2 &&
          offsetY <= baselineY + HIT_TOLERANCE_PX
        )
      }
      const index = findPeakIndex(props.data, mz, Math.abs(mzNear - mz), isHit)
      return index === -1 ? undefined : props.data[index]
    }

    const handleChartClick = (event: ElementEvent) => {
      cancelPendingClick()
      const peak = peakAtPointer(event)
      if (peak) {
        pendingClick = setTimeout(() => {
          pendingClick = undefined
          // The intensity-weighted centroid, not the most intense raw peak. Goes into the
          // existing manual m/z entry path, so the ion image uses the user's own ppm.
          emit('itemSelected', peak[0])
        }, DBLCLICK_GRACE_MS)
      }
    }

    // Anchor the tooltip away from the nearest edges so it never leaves the chart.
    const tooltipStyle = (chart: EChartsType, x: number, y: number): Record<string, string> => {
      const width = chart.getWidth()
      const height = chart.getHeight()
      return {
        ...(x > width / 2 ? { right: `${width - x + TOOLTIP_OFFSET_PX}px` } : { left: `${x + TOOLTIP_OFFSET_PX}px` }),
        ...(y > height / 2 ? { bottom: `${height - y + TOOLTIP_OFFSET_PX}px` } : { top: `${y + TOOLTIP_OFFSET_PX}px` }),
      }
    }

    const handleChartMouseMove = (event: ElementEvent) => {
      const chart = getChart()
      if (!chart) {
        return
      }
      const peak = peakAtPointer(event)
      chart.getZr().setCursorStyle(peak ? 'pointer' : 'default')
      state.hover = peak
        ? { style: tooltipStyle(chart, event.offsetX, event.offsetY), html: formatPeakTooltip(peak, statLabel.value) }
        : undefined
    }

    const handleChartMouseOut = () => {
      state.hover = undefined
    }

    const renderSpectrum = () => {
      const { isLoading } = props

      return (
        <div class="chart-holder !mt-0">
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
            onDatazoom={updateVisibleRange}
            {...{
              'onZr:dblclick': handleZoomReset,
              'onZr:click': handleChartClick,
              'onZr:mousemove': handleChartMouseMove,
              'onZr:globalout': handleChartMouseOut,
            }}
            option={state.chartOptions}
          />
          {state.hover && <div class="mean-spectrum-tooltip" style={state.hover.style} innerHTML={state.hover.html} />}
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
