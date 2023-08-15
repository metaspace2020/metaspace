import { computed, defineComponent, onMounted, onUnmounted, reactive, ref } from '@vue/composition-api'
// @ts-ignore
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import {
  SVGRenderer,
} from 'echarts/renderers'
import {
  ScatterChart,
} from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  MarkPointComponent,
} from 'echarts/components'
import { useQuery } from '@vue/apollo-composable'
import gql from 'graphql-tag'
import { sortBy } from 'lodash-es'
import { TRANSLATE_ANALYZER, TRANSLATE_MATRIX, TRANSLATE_SOURCE } from '../../../lib/matrixTranslator'
import { RadioButton, RadioGroup } from '../../../lib/element-ui'
import ImageSaver from '../../ImageViewer/ImageSaver.vue'
import './MassSpecSummaryChart.scss'
import config from '../../../lib/config'

use([
  SVGRenderer,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  MarkPointComponent,
])

interface MassSpecSummaryChartState {
  chartOptions: any
  size: number
  maldiY: number
  maldiX: number
  maldiWidth: string
  polarity: string
}

interface MassSpecSummaryChartProps {
}

const NEGATIVE_MODE = 'Negative mode'
const POSITIVE_MODE = 'Positive mode'

export const MassSpecSummaryChart = defineComponent<MassSpecSummaryChartProps>({
  name: 'MassSpecSummaryChart',
  setup(props, { emit, root }) {
    const { $store } = root

    // prettier-ignore
    const spectrumChart = ref(null)
    const container = ref(null)

    const state = reactive<MassSpecSummaryChartState>({
      polarity: POSITIVE_MODE,
      maldiY: 0,
      maldiX: 0,
      maldiWidth: '0px',
      size: 600,
      chartOptions: {
        tooltip: {
          position: 'top',
          formatter: function(params: any) {
            return (
              params.value[2]
              + ' datasets in '
              + params?.data?.label?.x
              + ' of '
              + params?.data?.label?.y
            )
          },
        },
        grid: {
          left: 2,
          bottom: 10,
          right: 10,
          containLabel: true,
        },
        xAxis:
          {
            type: 'category',
            data: [],
            axisLine: {
              show: false,
            },
            axisTick: {
              show: false,
            },
            axisLabel: {
              show: true,
              interval: 0,
              rotate: 90,
            },
            position: 'top',
          },
        yAxis: {
          type: 'category',
          data: [],
          axisLine: {
            show: false,
          },
          axisTick: {
            show: false,
          },
          axisLabel: {
            verticalAlign: 'middle',
            show: true,
            interval: 0,
            fontFamily: 'monospace',
            rich: {
              b: {
                fontFamily: 'monospace',
                fontWeight: 'bold',
              },
              h: {
                fontFamily: 'monospace',
                color: '#fff',
              },
            },

          },
        },
        series:
          {
            type: 'scatter',
            symbolSize: function(val: any) {
              return val[3] ? val[3] * 11 + 15 : 0
            },
            data: [],
            label: {
              show: true,
              color: 'black',
              formatter: function(param: any) {
                return param.data.value[2]
              },
              fontWeight: '300',
              minMargin: 10,
              verticalAlign: 'middle',
            },
          }
        ,
      },
    })

    const query =
    gql`query GetMSSetupCounts($filter: DatasetFilter, $query: String) {
      countDatasetsPerGroup(query: {
        fields: [DF_ANALYZER_TYPE, DF_ION_SOURCE, DF_MALDI_MATRIX, DF_POLARITY],
        filter: $filter,
        simpleQuery: $query
      }) {
        counts {
          fieldValues
          count
        }
      }
    }`

    const convertSource = (source: string) => Object.keys(TRANSLATE_SOURCE).includes(source)
      ? TRANSLATE_SOURCE[source] : 'Other'
    const convertAnalyzer = (analyzer: string) => Object.keys(TRANSLATE_ANALYZER).includes(analyzer)
      ? TRANSLATE_ANALYZER[analyzer] : 'Other'
    const convertMatrix = (matrix: string) => Object.keys(TRANSLATE_MATRIX).includes(matrix)
      ? TRANSLATE_MATRIX[matrix] : 'Other'
    const isSourceMaldi = (sourceType: string) => /maldi/i.test(sourceType)
    const isNA = (val: string) => /^(n\/?a|none|other|\s*)$/i.test(val)
    const OTHER_ANALYZER = '(other analyzer)'
    const OTHER_SOURCE = '(other ion source)'
    const OTHER_MATRIX = '(other matrix)'
    const matrixName = (matrix: string) => {
      if (matrix !== OTHER_MATRIX) {
        const match = matrix.replace('_', ' ').match(/\(([A-Z0-9]{2,10})\)/i)
        if (match) {
          return match[1]
        }
      }
      return matrix
    }

    const queryVariables = () => {
      const filter = Object.assign({ status: 'FINISHED' }, $store.getters.gqlDatasetFilter)
      const query = $store.getters.ftsQuery

      return {
        filter,
        query,
      }
    }
    const queryVars = computed(() => ({
      ...queryVariables(),
    }))

    const {
      result: receivedDatasetsResult,
      loading: receivedDatasetsResultLoading,
    } = useQuery<any>(query, queryVars)

    const dataChart = computed(() => receivedDatasetsResult.value != null
      ? receivedDatasetsResult.value.countDatasetsPerGroup : null)

    const getData = () => {
      if (!dataChart.value) {
        return []
      }

      const counts = dataChart.value.counts
      const inverted : any = { positive: 'negative', negative: 'positive' }
      const analyzerCounts : any = {}
      const sourceCounts : any = {}
      const matrixCounts : any = {}

      let normedCounts = counts.map((entry: any) => {
        let [analyzer, source, matrix, polarity] = entry.fieldValues
        source = convertSource(source)
        analyzer = convertAnalyzer(analyzer)
        matrix = convertMatrix(matrix)

        if (state.polarity === NEGATIVE_MODE && polarity === 'positive') return
        if (state.polarity === POSITIVE_MODE && polarity === 'negative') return

        const isMaldi = isSourceMaldi(source)
        if (isNA(analyzer)) {
          analyzer = OTHER_ANALYZER
        } else {
          analyzerCounts[analyzer] = (analyzerCounts[analyzer] || 0) + entry.count
        }
        if (isNA(source)) {
          source = OTHER_SOURCE
        } else if (!isMaldi) {
          sourceCounts[source] = (sourceCounts[source] || 0) + entry.count
        }
        if (isMaldi) {
          if (isNA(matrix)) {
            matrix = OTHER_MATRIX
          } else {
            matrix = matrixName(matrix)
            matrixCounts[matrix] = (matrixCounts[matrix] || 0) + entry.count
          }
        }
        polarity = String(polarity).toLowerCase()

        return {
          analyzer,
          sourceType: isMaldi ? matrix : source,
          isMaldi,
          polarity,
          count: entry.count,
        }
      })

      let topAnalyzers = sortBy(Object.entries(analyzerCounts), 1).map(([key] : any) => key)
      const topSources = sortBy(Object.entries(sourceCounts), 1).map(([key] : any) => key).reverse()
      const topMatrixes = sortBy(Object.entries(matrixCounts), 1).map(([key] : any) => key).reverse()
      let sources = topSources
      let hasOtherSource : boolean = false
      let hasOtherMatrix : boolean = false
      let hasOtherAnalyzer : boolean = false

      normedCounts = normedCounts.filter((entry: any) => entry)
      normedCounts.forEach((entry: any) => {
        if (!topAnalyzers.includes(entry.analyzer)) {
          entry.analyzer = OTHER_ANALYZER
          hasOtherAnalyzer = true
        }
        if (!entry.isMaldi && !topSources.includes(entry.sourceType)) {
          entry.sourceType = OTHER_SOURCE
          hasOtherSource = true
        }
        if (entry.isMaldi && !topMatrixes.includes(entry.sourceType)) {
          entry.sourceType = OTHER_MATRIX
          hasOtherMatrix = true
        }
      })

      if (hasOtherSource) {
        sources.push(OTHER_SOURCE)
      }
      sources = sources.concat(topMatrixes)
      if (hasOtherMatrix) {
        sources.push(OTHER_MATRIX)
      }
      if (hasOtherAnalyzer) {
        topAnalyzers = [OTHER_ANALYZER].concat(topAnalyzers)
      }

      // Group by analyzer, isMaldi and sourceType. Sum counts by polarity.
      const result : any = []
      normedCounts.forEach(({ analyzer, isMaldi, sourceType, polarity, count } : any) => {
        const datum : any = {
          analyzer,
          isMaldi,
          sourceType,
          counts: {
            [polarity]: count,
            [inverted[polarity]]: 0,
          },
          totalCount: count,
        }
        const existing = result.find((other : any) => ['analyzer', 'isMaldi', 'sourceType']
          .every(f => other[f] === datum[f]))
        if (existing) {
          ['positive', 'negative'].forEach(pol => { existing.counts[pol] += datum.counts[pol] })
          existing.totalCount += datum.totalCount
        } else {
          result.push(datum)
        }
      })

      const positive = result.map((entry: any) => {
        const idxY = topAnalyzers.findIndex((item: any) => item === entry.analyzer)
        const idxX = sources.findIndex((item: any) => item === entry.sourceType)
        return {
          value: [idxX,
            idxY,
            entry.totalCount, Math.log10(entry.totalCount + 1)],
          label: {
            x: entry.sourceType,
            y: entry.analyzer,
            isMaldi: entry.sourceType === topMatrixes[0],
            endMaldi: entry.sourceType === (hasOtherMatrix ? OTHER_MATRIX : topMatrixes[topMatrixes.length - 1]),
          },
        }
      })

      return { items: positive, yAxis: topAnalyzers, xAxis: sources }
    }

    const chartOptions = computed(() => {
      const auxOptions = state.chartOptions
      const chartData : any = getData()

      auxOptions.series.data = chartData?.items
      auxOptions.xAxis.data = chartData?.xAxis
      auxOptions.yAxis.data = chartData?.yAxis
      auxOptions.color = state.polarity === POSITIVE_MODE ? 'rgba(18, 135, 238, 0.5)' : 'rgba(255, 0, 0, 0.5)'

      state.size = chartData?.yAxis?.length < 7 ? 800 : chartData?.yAxis?.length * 100

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

    const handleChartRendered = () => {
      const chartRef : any = spectrumChart.value
      if (
        chartRef
        && chartRef.chart
        && chartOptions.value?.xAxis?.data?.length > 0
      ) {
        const auxOptions : any = chartOptions.value
        if (auxOptions) {
          auxOptions.series.data.forEach((item: any) => {
            const [chartX, chartY] = chartRef.convertToPixel({ seriesIndex: 0 }, [item.value[0], item.value[1]])
            if (item.label.isMaldi) {
              state.maldiY = chartY
              state.maldiX = chartX
            }
            if (item.label.endMaldi) {
              state.maldiWidth = `${chartX - state.maldiX}px`
            }
          })
        }
      }
    }

    return () => {
      return (
        <div
          ref={container}
          class='mass-spec-chart relative mt-4'>
          <div class='chart-header dom-to-image-hidden'>
            <div class='text-center font-medium'>Number of datasets per analyzer/ion source/matrix</div>
            <div class='tool-box'>
              <RadioGroup
                class='mr-2'
                value={state.polarity}
                size="mini"
                onInput={(text:any) => {
                  state.polarity = text
                }}>
                <RadioButton label={POSITIVE_MODE}/>
                <RadioButton label={NEGATIVE_MODE}/>
              </RadioGroup>
              <ImageSaver
                domNode={container.value}
                fileName={`mass-spec-summary-${state.polarity}-chart`}
              />
            </div>
          </div>
          <div class='chart-holder relative'>
            {
              receivedDatasetsResultLoading.value
              && <div class='loader-holder'>
                <div>
                  <i
                    class="el-icon-loading mr-2"
                  />
                  Loading data...
                </div>
              </div>
            }
            {
              state.maldiX !== 0
              && !receivedDatasetsResultLoading.value
              && <div class='absolute maldi-label'
                style={{
                  left: `${state.maldiX}px`,
                  width: state.maldiWidth,
                }}>MALDI</div>
            }
            {
              !receivedDatasetsResultLoading.value
              && <ECharts
                ref={spectrumChart}
                autoResize={true}
                {...{
                  on: {
                    rendered: handleChartRendered,
                  },
                }}
                class='chart'
                options={chartOptions.value}/>
            }
          </div>
        </div>
      )
    }
  },
})
