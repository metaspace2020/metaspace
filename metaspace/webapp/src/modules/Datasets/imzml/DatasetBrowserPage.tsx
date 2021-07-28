import { computed, defineComponent, onMounted, onUnmounted, reactive, ref } from '@vue/composition-api'
import { Select, Option, RadioGroup, Radio, InputNumber, Button } from '../../../lib/element-ui'
// @ts-ignore
import ECharts from 'vue-echarts'
import 'echarts/lib/chart/line'
import 'echarts/lib/chart/bar'
import 'echarts/lib/component/toolbox'
import 'echarts/lib/component/grid'
import 'echarts/lib/component/legend'
import 'echarts/lib/component/dataZoom'
import 'echarts/lib/component/markPoint'
import 'echarts/lib/component/markArea'
import './DatasetBrowserPage.scss'
import { useQuery } from '@vue/apollo-composable'
import { getDatasetByIdQuery, GetDatasetByIdQuery } from '../../../api/dataset'
import { annotationListQuery } from '../../../api/annotation'
import config from '../../../lib/config'
import safeJsonParse from '../../../lib/safeJsonParse'
import MainImage from '../../Annotations/annotation-widgets/default/MainImage.vue'

interface DatasetBrowserProps {
  className: string
}

interface DatasetBrowserState {
  peakFilter: number
  fdrFilter: number | undefined
  databaseFilter: number | string | undefined
  mzmScoreFilter: number | undefined
  mzmPolarityFilter: number | undefined
  mzmScaleFilter: string | undefined
  chartOptions: any
  sampleData: any[]
  chartLoading: boolean
  imageLoading: boolean
  ionImage: string | undefined
  metadata: any
  x: number | undefined
  y: number | undefined
}

const PEAK_FILTER = {
  ALL: 1,
  FDR: 2,
}

export default defineComponent<DatasetBrowserProps>({
  name: 'DatasetBrowserPage',
  props: {
    className: {
      type: String,
      default: 'dataset-browser',
    },
  },
  setup: function(props, ctx) {
    const { $route, $store } = ctx.root
    const spectrumChart = ref(null)
    const state = reactive<DatasetBrowserState>({
      peakFilter: PEAK_FILTER.ALL,
      fdrFilter: undefined,
      databaseFilter: undefined,
      mzmScoreFilter: undefined,
      mzmPolarityFilter: undefined,
      mzmScaleFilter: undefined,
      metadata: undefined,
      ionImage: undefined,
      chartLoading: false,
      imageLoading: false,
      x: undefined,
      y: undefined,
      sampleData: [],
      chartOptions: {
        grid: {
          top: 60,
          bottom: 80,
          left: '10%',
          right: '10%',
        },
        animation: false,
        toolbox: {
          feature: {
            restore: {
              title: 'Restore',
            },
            dataZoom: {
              title: {
                zoom: 'Zoom',
                back: 'Zoom reset',
              },
            },
            saveAsImage: {
              title: 'Download',
            },
          },
        },
        xAxis: {
          name: 'm/z',
          nameLocation: 'center',
          nameGap: 30,
          nameTextStyle: {
            fontWeight: 'bold',
            fontSize: 14,
          },
          type: 'value',
          axisLabel: {
            formatter: function(value: any) {
              return value.toFixed(0.4)
            },
          },
        },
        yAxis: {
          name: 'Intensity',
          nameLocation: 'center',
          nameGap: 30,
          nameTextStyle: {
            fontWeight: 'bold',
            fontSize: 14,
          },
          type: 'value',
          boundaryGap: [0, '30%'],
        },
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: 0,
            filterMode: 'empty',
          },
          {
            type: 'slider',
            yAxisIndex: 0,
            filterMode: 'empty',
            right: 16,
          },
        ],
        legend: {
          selectedMode: false,
        },
        series: [
          {
            name: 'Unannotated',
            type: 'bar',
            data: [],
            barWidth: 2,
            itemStyle: {
              color: 'red',

            },
            markArea: {
              data: [],
            },
            markPoint: {
              symbol: 'circle',
              symbolSize: 10,
              label: {
                show: false,
              },
              data: [],
            },
          },
          {
            name: 'Annotated',
            type: 'bar',
            data: [],
            itemStyle: {
              color: 'blue',
            },
          },
        ],
      },
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

    const queryVariables = () => {
      const filter = $store.getters.gqlAnnotationFilter
      const dFilter = $store.getters.gqlDatasetFilter
      const colocalizationCoeffFilter = $store.getters.gqlColocalizationFilter
      const query = $store.getters.ftsQuery

      return {
        filter,
        dFilter,
        query,
        colocalizationCoeffFilter,
        countIsomerCompounds: config.features.isomers,
        limit: 10000,
        offset: 0,
        orderBy: 'ORDER_BY_FDR_MSM',
        sortingOrder: 'DESCENDING',
      }
    }

    const datasetId = computed(() => $route.params.dataset_id)
    const {
      result: datasetResult,
      loading: datasetLoading,
    } = useQuery<GetDatasetByIdQuery>(getDatasetByIdQuery, {
      id: datasetId,
    })

    const queryOptions = reactive({ enabled: true, fetchPolicy: 'no-cache' as const })
    const queryVars = computed(() => ({
      ...queryVariables(),
      filter: { ...queryVariables().filter, fdrLevel: state.fdrFilter, databaseId: state.databaseFilter },
      dFilter: { ...queryVariables().dFilter, ids: datasetId },
    }))
    const {
      result: annotationsResult,
      loading: annotationsLoading,
      onResult: onAnnotationsResult,
    } = useQuery<any>(annotationListQuery, queryVars,
      queryOptions)
    const dataset = computed(() => datasetResult.value != null ? datasetResult.value.dataset : null)
    const annotations = computed(() => annotationsResult.value != null
      ? annotationsResult.value.allAnnotations : null)

    const annotatedPeaks = computed(() => {
      if (annotations.value) {
        return annotations.value.map((annot: any) => annot.mz)
      }
      return []
    })

    const requestSpectrum = async(x: number = 0, y: number = 0) => {
      // @ts-ignore
      const inputPath: string = dataset.value.inputPath.replace('s3a:', 's3:')
      const url = 'http://127.0.0.1:8000/search_pixel'

      try {
        state.chartLoading = true
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          method: 'POST',
          body: JSON.stringify({
            s3_path: inputPath,
            x,
            y,
          }),
        })
        const content = await response.json()
        state.sampleData = [content]
        state.x = content.x
        state.y = content.y
      } catch (e) {
        console.log('E', e)
      } finally {
        state.chartLoading = false
        buildChartOptions()
      }
    }

    const requestIonImage = async() => {
      // @ts-ignore
      const inputPath: string = dataset.value.inputPath.replace('s3a:', 's3:')
      const url = 'http://127.0.0.1:8000/search'

      try {
        state.imageLoading = true
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          method: 'POST',
          body: JSON.stringify({
            s3_path: inputPath,
            mz: state.mzmScoreFilter,
            ppm: state.mzmPolarityFilter,
          }),
        })

        const content = await response.blob()
        const src = URL.createObjectURL(content)
        state.ionImage = src
      } catch (e) {
        console.log('E', e)
      } finally {
        state.imageLoading = false
      }
    }

    onAnnotationsResult((result) => {
      if (dataset.value && result) {
        const mz = result.data.allAnnotations[0].mz
        const ppm = 3
        state.mzmScoreFilter = mz
        state.mzmPolarityFilter = ppm
        state.mzmScaleFilter = 'ppm'
        requestIonImage()
        buildMetadata(dataset.value)
      }
      queryOptions.enabled = false
    })

    const handleFilterClear = () => {
      state.peakFilter = PEAK_FILTER.ALL
      state.fdrFilter = undefined
      state.databaseFilter = undefined
      state.mzmScoreFilter = undefined
      state.mzmPolarityFilter = undefined
      state.mzmScaleFilter = undefined
      queryOptions.enabled = true
    }

    const buildMetadata = (dataset: any) => {
      const datasetMetadataExternals = {
        Submitter: dataset.submitter,
        PI: dataset.principalInvestigator,
        Group: dataset.group,
        Projects: dataset.projects,
      }
      state.metadata = Object.assign(safeJsonParse(dataset.metadataJson), datasetMetadataExternals)
    }

    const getPixelSizeX = () => {
      if (state.metadata && state.metadata.MS_Analysis != null
        && state.metadata.MS_Analysis.Pixel_Size != null) {
        return state.metadata.MS_Analysis.Pixel_Size.Xaxis
      }
      return 0
    }

    const getPixelSizeY = () => {
      if (state.metadata && state.metadata.MS_Analysis != null
        && state.metadata.MS_Analysis.Pixel_Size != null) {
        return state.metadata.MS_Analysis.Pixel_Size.Yaxis
      }
      return 0
    }

    const renderBrowsingFilters = () => {
      return (
        <div class='dataset-browser-holder-filter-box'>
          <span class='font-semibold'>Browsing filters</span>
          <div class='flex flex-row w-full items-end'>
            <RadioGroup
              class='w-3/5'
              onInput={(value: any) => {
                state.peakFilter = value

                if (dataset.value && state.databaseFilter === undefined) {
                  state.databaseFilter = dataset.value.databases[0].id
                }

                if (value === PEAK_FILTER.FDR && !state.fdrFilter) {
                  state.fdrFilter = 0.05
                } else if (value === PEAK_FILTER.ALL) {
                  state.fdrFilter = undefined
                  state.databaseFilter = undefined
                }
              }}
              value={state.peakFilter}
              size='mini'>
              <Radio class='w-full' label={PEAK_FILTER.ALL}>All Peaks</Radio>
              <div>
                <Radio label={PEAK_FILTER.FDR}>Show annotated at FDR</Radio>
                <Select
                  class='select-box-mini'
                  value={state.fdrFilter}
                  onChange={(value: number) => {
                    state.fdrFilter = value
                    state.peakFilter = PEAK_FILTER.FDR
                  }}
                  placeholder='5%'
                  size='mini'>
                  <Option label="5%" value={0.05}/>
                  <Option label="10%" value={0.1}/>
                  <Option label="20%" value={0.2}/>
                  <Option label="50%" value={0.5}/>
                </Select>
              </div>
            </RadioGroup>
            <div class='flex flex-col w-1/4'>
              <span class='text-xs'>Database</span>
              <Select
                value={state.databaseFilter}
                size='mini'
                onChange={(value: number) => {
                  state.databaseFilter = value
                }}
                placeholder='HMDB - v4'>
                {
                  dataset.value
                  && dataset.value.databases.map((database: any) => {
                    return (
                      <Option label={`${database.name} - ${database.version}`} value={database.id}/>
                    )
                  })
                }
              </Select>
            </div>
          </div>
        </div>
      )
    }

    const renderImageFilters = () => {
      return (
        <div class='dataset-browser-holder-filter-box'>
          <span class='font-semibold'>Image filters</span>
          <div class='flex flex-row w-full items-end'>
            <span class='mr-2'>m/z</span>
            <InputNumber
              class='mr-2'
              value={state.mzmScoreFilter}
              onChange={(value: number) => {
                state.mzmScoreFilter = value
              }}
              precision={4}
              step={0.0001}
              size='mini'
              placeholder='174.0408'
            />
            <span class='mr-2'>+-</span>
            <InputNumber
              class='mr-2 select-box'
              value={state.mzmPolarityFilter}
              onChange={(value: number) => {
                state.mzmPolarityFilter = value
              }}
              precision={1}
              step={0.01}
              size='mini'
              placeholder='2.5'
            />
            <Select
              class='select-box-mini'
              value={state.mzmScaleFilter}
              onChange={(value: string) => {
                state.mzmScaleFilter = value
              }}
              size='mini'
              placeholder='ppm'>
              <Option label="DA" value='DA'/>
              <Option label="ppm" value='ppm'/>
            </Select>
          </div>
        </div>
      )
    }

    const renderSpectrumFilterBox = () => {
      return (
        <div>
          {renderBrowsingFilters()}
          <Button class='clear-btn' size='mini' onClick={handleFilterClear}>
            Clear
          </Button>
          <Button class='filter-btn' type='primary' size='mini' onClick={() => {
            queryOptions.enabled = true
          }}>
            Filter
          </Button>
        </div>
      )
    }

    const renderImageFilterBox = () => {
      return (
        <div>
          {renderImageFilters()}
          <Button class='filter-btn' type='primary' size='mini' onClick={() => {
            requestIonImage()
          }}>
            Filter
          </Button>
        </div>
      )
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

    const buildChartOptions = () => {
      if (!state.sampleData || (Array.isArray(state.sampleData) && state.sampleData.length === 0)) {
        return
      }

      const auxOptions = state.chartOptions
      const data = []
      const markAreaData = []
      const markPointData: any[] = []
      const annotatedTheoreticalMzs = annotatedPeaks.value
      let minX
      let maxX
      const maxIntensity = Math.max(...state.sampleData[0].ints)

      for (let i = 0; i < state.sampleData[0].mzs.length; i++) {
        const xAxis = state.sampleData[0].mzs[i]
        const yAxis = state.sampleData[0].ints[i] / maxIntensity * 100.0
        let isAnnotated = false

        if (!minX || xAxis < minX) {
          minX = xAxis
        }
        if (!maxX || xAxis > maxX) {
          maxX = xAxis
        }
        // check if is annotated
        annotatedTheoreticalMzs.forEach((theoreticalMz: number) => {
          const highestMz = theoreticalMz * 1.000003
          const lowestMz = theoreticalMz * 0.999997
          if (xAxis >= lowestMz && xAxis <= highestMz) {
            isAnnotated = true
          }
        })

        if (state.peakFilter === PEAK_FILTER.ALL && !isAnnotated) { // add unnanotated peaks
          data.push({
            value: [xAxis, yAxis],
            itemStyle: {
              color: isAnnotated ? 'blue' : 'red',
            },
          })

          markPointData.push({
            xAxis: xAxis,
            yAxis: yAxis,
            itemStyle: {
              color: isAnnotated ? 'blue' : 'red',
            },
          })
          markAreaData.push([
            {
              xAxis: xAxis * 1.000003,
              yAxis: 0,
              itemStyle: {
                color: isAnnotated ? 'blue' : 'red',
                opacity: 0.3,
              },
            },
            {
              xAxis: xAxis * 0.999997,
              yAxis: yAxis,
              itemStyle: {
                color: isAnnotated ? 'green' : 'blue',
                opacity: 0.3,
              },

            },
          ])
        }

        if (isAnnotated) {
          data.push({
            value: [xAxis, yAxis],
            itemStyle: {
              color: isAnnotated ? 'blue' : 'red',
            },
          })
          markPointData.push({
            xAxis: xAxis,
            yAxis: yAxis,
            itemStyle: {
              color: isAnnotated ? 'blue' : 'red',
            },
          })
          markAreaData.push([
            {
              xAxis: xAxis * 1.000003,
              yAxis: 0,
              itemStyle: {
                color: isAnnotated ? 'blue' : 'red',
                opacity: 0.3,
              },
            },
            {
              xAxis: xAxis * 0.999997,
              yAxis: yAxis,
              itemStyle: {
                color: isAnnotated ? 'green' : 'blue',
                opacity: 0.3,
              },

            },
          ])
        }
      }

      auxOptions.xAxis.min = minX
      auxOptions.xAxis.max = maxX
      auxOptions.series[0].data = data
      auxOptions.series[0].markArea.data = markAreaData
      auxOptions.series[0].markPoint.data = markPointData
      state.chartOptions = auxOptions
    }

    const handlePixelSelect = (coordinates: any) => {
      requestSpectrum(coordinates.x, coordinates.y)
    }

    const getImageLoaderSettings = () => {
      return {
        annotImageOpacity: 1.0,
        opticalOpacity: 1.0,
        opacityMode: 'constant',
        imagePosition: {
          zoom: 1,
          xOffset: 0,
          yOffset: 0,
        },
        opticalSrc: null,
        opticalTransform: null,
        pixelAspectRatio: config.features.ignore_pixel_aspect_ratio ? 1
          : getPixelSizeX() && getPixelSizeY() && getPixelSizeX() / getPixelSizeY() || 1,
      }
    }

    return () => {
      const isEmpty = state.x === undefined && state.y === undefined

      return (
        <div class={'dataset-browser-container'}>
          <div class={'dataset-browser-wrapper w-full lg:w-1/2'}>
            <div class='dataset-browser-holder'>
              <div class='dataset-browser-holder-header'>
                Spectrum browser
              </div>
              {renderSpectrumFilterBox()}
              {
                isEmpty && !state.chartLoading
                && renderEmptySpectrum()
              }
              {
                (!isEmpty || state.chartLoading)
                && <div class='relative'>
                  {
                    (annotationsLoading.value || state.chartLoading)
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
                    {...{ on: { 'zr:dblclick': handleZoomReset } }}
                    class='chart' options={state.chartOptions}/>
                </div>
              }
            </div>
          </div>
          <div class='dataset-browser-wrapper w-full lg:w-1/2'>
            <div class='dataset-browser-holder'>
              <div class='dataset-browser-holder-header'>
                Image viewer
              </div>
              {renderImageFilterBox()}
              <div class='ion-image-holder'>
                {
                  (annotationsLoading.value || state.imageLoading)
                  && <div class='loader-holder'>
                    <div>
                      <i
                        class="el-icon-loading"
                      />
                    </div>
                  </div>
                }
                {
                  state.ionImage
                  && annotations.value
                  && <MainImage
                    keepPixelSelected
                    annotation={{
                      ...annotations.value[0],
                      mz: state.mzmScoreFilter,
                      isotopeImages: [
                        {
                          ...annotations.value[0].isotopeImages[0],
                          maxIntensity: 200,
                          minIntensity: 27,
                          mz: state.mzmScoreFilter,
                          totalIntensity: 20000,
                          url: state.ionImage,
                        },
                      ],
                    }}
                    opacity={1}
                    imageLoaderSettings={getImageLoaderSettings()}
                    applyImageMove={() => { }}
                    colormap='Viridis'
                    scaleType='linear'
                    {...{ on: { 'pixel-select': handlePixelSelect } }}
                  />
                }
              </div>
            </div>
          </div>
        </div>
      )
    }
  },
})
