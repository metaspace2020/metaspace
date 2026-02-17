import { computed, defineComponent, onMounted, onUnmounted, reactive, ref } from 'vue'
import {
  ElSelect,
  ElOption,
  ElRadioGroup,
  ElRadio,
  ElInputNumber,
  ElInput,
  ElRadioButton,
  ElIcon,
  ElCheckbox,
} from '../../../lib/element-plus'
import { useQuery } from '@vue/apollo-composable'
import {
  datasetListItemsQuery,
  DatasetDetailItem,
  getBrowserImage,
  GetDatasetByIdQuery,
  getDatasetByIdWithPathQuery,
  getSpectrum,
  getInitialPeak,
} from '../../../api/dataset'
import { annotationListQuery } from '../../../api/annotation'
import config from '../../../lib/config'
import safeJsonParse from '../../../lib/safeJsonParse'
import { DatasetBrowserSpectrumChart } from './DatasetBrowserSpectrumChart'
import './DatasetBrowserPage.scss'
import { SimpleIonImageViewer } from '../../../components/SimpleIonImageViewer/SimpleIonImageViewer'
import { calculateMzFromFormula, isFormulaValid, parseFormulaAndCharge } from '../../../lib/formulaParser'
import reportError from '../../../lib/reportError'
import { readNpy } from '../../../lib/npyHandler'
import { DatasetBrowserKendrickPlot } from './DatasetBrowserKendrickPlot'
import FadeTransition from '../../../components/FadeTransition'
import CandidateMoleculesPopover from '../../Annotations/annotation-widgets/CandidateMoleculesPopover.vue'
import MolecularFormula from '../../../components/MolecularFormula'
import CopyButton from '../../../components/CopyButton.vue'
import * as FileSaver from 'file-saver'
import MainImageHeader from '../../Annotations/annotation-widgets/default/MainImageHeader.vue'
import { get, uniq, uniqBy } from 'lodash-es'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { InfoFilled, Loading } from '@element-plus/icons-vue'

interface GlobalImageSettings {
  resetViewPort: boolean
  isNormalized: boolean
  scaleBarColor: string
  scaleType: string
  colormap: string
  selectedLockTemplate: string | null
  globalLockedIntensities: [number | undefined, number | undefined]
  showOpticalImage: boolean
}

interface DatasetBrowserState {
  datasetName: string | undefined
  selectedDataset: any
  dataRange: any
  peakFilter: number
  fdrFilter: number | undefined
  moleculeFilter: string | undefined
  databaseFilter: number | string | undefined
  mzmScoreFilter: number | undefined
  mzmShiftFilter: number | undefined
  mzmScaleFilter: string | undefined
  ionImageUrl: any
  sampleData: any[]
  chartData: any[]
  chartLoading: boolean
  imageLoading: boolean
  invalidFormula: boolean
  showOpticalImage: boolean
  referenceFormula: any
  invalidReferenceFormula: boolean
  fixedMassReference: number
  referenceFormulaMz: number
  metadata: any
  annotation: any
  normalizationData: any
  showFullTIC: boolean
  x: number | undefined
  y: number | undefined
  currentView: string
  normalization: number | undefined
  mz: number | undefined
  mzLow: number | undefined
  mzHigh: number | undefined
  refMzLow: number | undefined
  refMzHigh: number | undefined
  enableImageQuery: boolean
  noData: boolean
  globalImageSettings: GlobalImageSettings
}

const PEAK_FILTER = {
  ALL: 1,
  FDR: 2,
  OFF: 3,
}

const VIEWS = {
  SPECTRUM: 'Mass spectrum',
  KENDRICK: 'Kendrick plot',
}

export default defineComponent({
  name: 'DatasetBrowserPage',
  props: {
    className: {
      type: String,
      default: 'dataset-browser',
    },
  },
  setup: function () {
    const route = useRoute()
    const router = useRouter()
    const store = useStore()
    const state = reactive<DatasetBrowserState>({
      datasetName: undefined,
      selectedDataset: undefined,
      dataRange: { maxX: 0, maxY: 0, minX: 0, minY: 0 },
      peakFilter: PEAK_FILTER.ALL,
      fdrFilter: 0.05,
      databaseFilter: undefined,
      mzmScoreFilter: undefined,
      mzmShiftFilter: undefined,
      mzmScaleFilter: undefined,
      metadata: undefined,
      annotation: undefined,
      noData: false,
      chartLoading: false,
      imageLoading: false,
      showOpticalImage: true,
      moleculeFilter: undefined,
      x: undefined,
      y: undefined,
      ionImageUrl: undefined,
      sampleData: [],
      chartData: [],
      normalizationData: {},
      invalidFormula: false,
      invalidReferenceFormula: false,
      referenceFormula: undefined,
      fixedMassReference: 14.01565006, // m_CH2=14.0156,
      referenceFormulaMz: 14.01565006, // m_CH2=14.0156,
      currentView: VIEWS.SPECTRUM,
      showFullTIC: true,
      normalization: undefined,
      mz: undefined,
      mzLow: undefined,
      mzHigh: undefined,
      refMzLow: undefined,
      refMzHigh: undefined,
      enableImageQuery: false,
      globalImageSettings: {
        resetViewPort: false,
        isNormalized: true,
        scaleBarColor: '#000000',
        scaleType: 'linear',
        colormap: 'Viridis',
        showOpticalImage: false,
        selectedLockTemplate: null,
        globalLockedIntensities: [undefined, undefined],
      },
    })

    const container = ref<any>(null)

    const queryVariables = () => {
      const filter = store.getters.gqlAnnotationFilter
      const dFilter = store.getters.gqlDatasetFilter
      const colocalizationCoeffFilter = store.getters.gqlColocalizationFilter
      const query = store.getters.ftsQuery

      return {
        filter,
        dFilter,
        query,
        colocalizationCoeffFilter,
        countIsomerCompounds: config.features.isomers,
        limit: 10000,
        offset: 0,
        orderBy: 'ORDER_BY_MZ',
        sortingOrder: 'ASCENDING',
      }
    }

    const datasetId = computed(() => route.params.dataset_id)
    const { result: datasetResult, onResult: onDatasetsResult } = useQuery<GetDatasetByIdQuery>(
      getDatasetByIdWithPathQuery,
      () => ({
        id: datasetId.value,
      })
    )

    const dsQueryVars = computed(() => ({
      dFilter: {
        ids: null,
        polarity: null,
        metadataType: 'Imaging MS',
        status: 'FINISHED',
        name: state.datasetName,
      },
      query: '',
      limit: 100,
    }))
    const { result: datasetsResult, loading: datasetLoading } = useQuery<{ allDatasets: DatasetDetailItem[] }>(
      datasetListItemsQuery,
      dsQueryVars
    )
    const datasetOptions = computed(() => datasetsResult.value?.allDatasets || [])

    onDatasetsResult(async (result) => {
      if (!result?.data?.dataset) {
        return
      }

      try {
        const dataset = result!.data.dataset

        state.selectedDataset = dataset

        if (dataset && state.databaseFilter === undefined) {
          state.databaseFilter = dataset.databases[0].id
        }
        const tics = dataset.diagnostics.filter((diagnostic: any) => diagnostic.type === 'TIC')
        const tic = tics[0].images.filter((image: any) => image.key === 'TIC' && image.format === 'NPY')
        const { data, shape } = await readNpy(tic[0].url)
        const metadata = safeJsonParse(tics[0].data)
        metadata.maxTic = metadata.max_tic
        metadata.minTic = metadata.min_tic
        delete metadata.max_tic
        delete metadata.min_tic

        state.normalizationData = {
          data,
          shape,
          metadata: metadata,
          type: 'TIC',
          showFullTIC: state.showFullTIC,
          error: false,
        }
      } catch (e) {
        state.normalizationData = {
          data: null,
          shape: null,
          metadata: null,
          showFullTIC: null,
          type: 'TIC',
          error: true,
        }
      } finally {
        queryOptions.enabled = true
      }
    })

    const queryOptions = reactive({ enabled: false, fetchPolicy: 'no-cache' as const })
    const queryVars = computed(() => ({
      ...queryVariables(),
      filter: {
        ...queryVariables().filter,
        fdrLevel: state.fdrFilter,
        databaseId: state.databaseFilter === '' ? undefined : state.databaseFilter,
      },
      dFilter: { ...queryVariables().dFilter, ids: datasetId.value },
    }))

    const imageQueryOptions = reactive({ enabled: false, fetchPolicy: 'no-cache' as const })

    const { result: browserResult, onResult: onImageResult } = useQuery<any>(
      getBrowserImage,
      () => ({
        datasetId: datasetId.value,
        mzLow: state.mzLow,
        mzHigh: state.mzHigh,
        refMzLow: state.refMzLow,
        refMzHigh: state.refMzHigh,
      }),
      imageQueryOptions as any
    )

    const spectrumQueryOptions = reactive({ enabled: false, fetchPolicy: 'no-cache' as const })

    const { result: spectrumResult, onResult: onSpectrumResult } = useQuery<any>(
      getSpectrum,
      () => ({ datasetId: datasetId.value, x: state.x, y: state.y }),
      spectrumQueryOptions as any
    )
    const pixelSpectrum = computed(() => spectrumResult.value?.pixelSpectrum)

    const peakQueryOptions = reactive({ enabled: false, fetchPolicy: 'cache-first' as const })
    const { onResult: onInitialPeakResult } = useQuery<any>(
      getInitialPeak,
      () => ({ datasetId: datasetId.value }),
      peakQueryOptions
    )

    const buildChartData = (ints: any, mzs: any) => {
      let maxX: number = 0
      let minX: number = -1
      let maxY: number = 0
      let minY: number = -1
      const addedIndexes: number[] = []
      const auxData: any[] = []
      const unAnnotItemStyle: any = {
        color: '#DC3220',
      }
      const annotItemStyle: any = {
        color: '#005AB5',
      }
      const exactMass: number = state.fixedMassReference !== -1 ? state.fixedMassReference : state.referenceFormulaMz
      const threshold: number = 1

      if (state.peakFilter !== PEAK_FILTER.OFF) {
        const annotatedPeaks: any = {}

        // build tooltips databases
        annotations.value.forEach((annotation: any) => {
          let tooltip: string = ''
          const mz: number = annotation.mz

          annotation.possibleCompounds.forEach((compound: any) => {
            tooltip += compound.name.substring(0, 50) + (compound.name.length > 50 ? '...' : '') + '<br>'
          })

          if (!annotatedPeaks[annotation.database]) {
            annotatedPeaks[annotation.database] = {}
          }

          if (!annotatedPeaks[annotation.database][mz]) {
            annotatedPeaks[annotation.database][mz] =
              Object.keys(annotatedPeaks).length === 1
                ? `Candidate molecules ${annotation.database}: <br>` + tooltip
                : `<br>Candidate molecules ${annotation.database}: <br>` + tooltip
          } else {
            annotatedPeaks[annotation.database][mz] = tooltip
          }
        })

        annotations.value.forEach((annotation: any) => {
          const mz: number = annotation.mz
          const mzLow: number = mz - mz * state.mzmShiftFilter! * 1e-6 // ppm
          const mzHigh: number = mz + mz * state.mzmShiftFilter! * 1e-6 // ppm
          const inRangeIdx: number = (mzs || []).findIndex((value: number) => {
            return value >= mzLow && value <= mzHigh
          })
          if (inRangeIdx !== -1) {
            const int: number = ints[inRangeIdx]
            const kendrickMass = (mz * Math.round(exactMass)) / exactMass
            const KendrickMassDefect = kendrickMass - Math.floor(kendrickMass)
            const radius = Math.log10(int / threshold)

            if (mz > maxX) {
              maxX = mz
            }
            if (mz < minX || minX === -1) {
              minX = mz
            }
            if (int > maxY) {
              maxY = int
            }
            if (int < minY || minY === -1) {
              minY = int
            }

            addedIndexes.push(inRangeIdx)

            let tooltip = ''
            Object.keys(annotatedPeaks).forEach((db: any) => {
              const auxItem: any = annotatedPeaks[db]
              Object.keys(auxItem).forEach((hashMz: any) => {
                if (parseFloat(hashMz) === mz) {
                  tooltip += auxItem[hashMz]
                }
              })
            })

            const dbs: any = tooltip.split('Candidate molecules ')
            let finalTooltip: any = `m/z: ${mz.toFixed(4)}<br>`
            dbs.forEach((db: any, dbIdx: number) => {
              const mols: any = uniq(db.split('<br>'))
              if (mols[0]) {
                finalTooltip +=
                  dbIdx > 1 ? `<br>Candidate molecules ${mols[0]}<br>` : `Candidate molecules ${mols[0]}<br>`
                finalTooltip +=
                  mols.slice(1, 6).join('<br>') + `${mols.length > 7 ? `<br>and more ${mols.length - 7}...` : ''}<br>`
              }
            })

            if (state.currentView === VIEWS.KENDRICK) {
              auxData.push({
                isAnnotated: true,
                dot: {
                  name: mz.toFixed(4),
                  tooltip: finalTooltip,
                  mz: mz,
                  value: [mz, KendrickMassDefect, radius],
                  itemStyle: annotItemStyle,
                },
              })
            } else {
              auxData.push({
                isAnnotated: true,
                dot: {
                  name: mz.toFixed(4),
                  tooltip: finalTooltip,
                  mz: mz,
                  value: [mz, int],
                  itemStyle: annotItemStyle,
                },
                line: {
                  tooltip: finalTooltip,
                  mz: mz,
                  xAxis: mz,
                  yAxis: int,
                  itemStyle: annotItemStyle,
                },
              })
            }
          }
        })
      }

      if (state.peakFilter !== PEAK_FILTER.FDR) {
        ;(mzs || []).forEach((mz: any, index: any) => {
          if (!addedIndexes.includes(index)) {
            const int: number = ints[index]
            const kendrickMass = (mz * Math.round(exactMass)) / exactMass
            const KendrickMassDefect = kendrickMass - Math.floor(kendrickMass)
            const radius = Math.log10(int / threshold)

            if (mz > maxX) {
              maxX = mz
            }
            if (mz < minX || minX === -1) {
              minX = mz
            }
            if (int > maxY) {
              maxY = int
            }
            if (int < minY || minY === -1) {
              minY = int
            }
            if (state.currentView === VIEWS.KENDRICK) {
              auxData.push({
                isAnnotated: false,
                dot: {
                  name: mz.toFixed(4),
                  tooltip: `m/z: ${mz.toFixed(4)}`,
                  mz: mz,
                  value: [mz, KendrickMassDefect, radius],
                  symbol: 'diamond',
                  itemStyle: unAnnotItemStyle,
                },
              })
            } else {
              auxData.push({
                isAnnotated: false,
                dot: {
                  name: mz.toFixed(4),
                  tooltip: `m/z: ${mz.toFixed(4)}`,
                  mz: mz,
                  value: [mz, int],
                  itemStyle: unAnnotItemStyle,
                },
                line: {
                  mz: mz,
                  xAxis: mz,
                  yAxis: int,
                  symbol: 'diamond',
                  itemStyle: unAnnotItemStyle,
                },
              })
            }
          }
        })
      }

      state.sampleData = auxData.reverse() // reverse to show annotated after
      state.dataRange = { maxX, maxY, minX, minY }
    }

    onSpectrumResult(async (result: any) => {
      if (result && result.data && result.data.pixelSpectrum) {
        buildChartData(result.data.pixelSpectrum.ints, result.data.pixelSpectrum.mzs)
      }
      state.chartLoading = false
    })

    onMounted(() => {
      resizeHandler()
      window.addEventListener('resize', resizeHandler)
    })

    onUnmounted(() => {
      window.removeEventListener('resize', resizeHandler)
    })

    const dimensions = reactive({
      width: 600,
      height: 500,
    })

    const resizeHandler = () => {
      let width = 0
      let height = 0
      if (container.value && container.value.clientWidth > width) {
        width = container.value.clientWidth
      }
      if (container.value?.clientHeight > height) {
        height = container.value.clientHeight
      }
      if (width !== 0 && height !== 0) {
        dimensions.width = width
        // dimensions.height = height
      }
    }

    const b64toBlob = (b64Data: any, contentType = '', sliceSize = 512) => {
      const byteCharacters = atob(b64Data)
      const byteArrays = []

      for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize)

        const byteNumbers = new Array(slice.length)
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i)
        }

        const byteArray = new Uint8Array(byteNumbers)
        byteArrays.push(byteArray)
      }

      const blob = new Blob(byteArrays, { type: contentType })
      return blob
    }

    onImageResult(async (result: any) => {
      if (result?.data?.browserImage?.image) {
        const blob = b64toBlob(result?.data?.browserImage?.image.replace('data:image/png;base64,', ''), 'image/png')
        state.ionImageUrl = URL.createObjectURL(blob)

        let currentAnnotationIdx: number = -1

        if (annotations.value) {
          const theoreticalMz = state.mz as number
          const highestMz = theoreticalMz * 1.000003
          const lowestMz = theoreticalMz * 0.999997
          currentAnnotationIdx = annotations.value.findIndex(
            (annotation: any) => annotation.mz >= lowestMz && annotation.mz <= highestMz
          )
        }

        if (currentAnnotationIdx === -1) {
          // not annotated
          state.annotation = {
            dataset: annotations.value[0]?.dataset,
            mz: state.mz,
            isotopeImages: [
              {
                mz: state.mz,
                url: state.ionImageUrl,
                minIntensity: 0,
                maxIntensity: browserResult?.value?.browserImage?.maxIntensity,
              },
            ],
          }
        } else {
          state.annotation = {
            ...annotations.value[currentAnnotationIdx],
            isotopeImages: [
              {
                mz: state.mz,
                url: state.ionImageUrl,
                minIntensity: 0,
                maxIntensity: browserResult?.value?.browserImage?.maxIntensity,
              },
            ],
          }
        }

        if (spectrumResult.value) {
          buildChartData(pixelSpectrum.value?.ints, pixelSpectrum.value?.mzs)
        }
        state.noData = false
      } else {
        state.noData = true
        state.annotation = undefined
        peakQueryOptions.enabled = true
      }
    })

    const {
      result: annotationsResult,
      loading: annotationsLoading,
      onResult: onAnnotationsResult,
    } = useQuery<any>(annotationListQuery, queryVars, queryOptions as any)
    const dataset = computed(() => (datasetResult.value != null ? datasetResult.value.dataset : null))
    const annotations = computed(() =>
      annotationsResult.value != null ? annotationsResult.value.allAnnotations : null
    )

    const annotatedPeaks = computed(() => {
      if (annotations.value) {
        return annotations.value.map((annot: any) => {
          return {
            possibleCompounds: annot.possibleCompounds,
            mz: annot.mz,
          }
        })
      }
      return []
    })

    const requestSpectrum = async (x: number = 0, y: number = 0) => {
      try {
        if (x !== state.x || y !== state.y) {
          state.chartLoading = true
        } else if (spectrumResult.value) {
          buildChartData(pixelSpectrum.value?.ints, pixelSpectrum.value?.mzs)
        }
        state.x = x
        state.y = y
        spectrumQueryOptions.enabled = true
        if (state.showFullTIC) {
          const i = y * state.normalizationData.shape[1] + x
          state.normalization = state.normalizationData.data[i] // ticPixel
        }
      } catch (e) {
        reportError(e)
      }
    }

    const handleDownload = () => {
      const cols = ['dataset_name', 'dataset_id', 'x', 'y', 'mz', 'intensity', 'KMD', 'is_annotated']
      const rows: any = [cols]

      state.sampleData.forEach((item: any) => {
        const mz: number = item.dot.mz
        const int: number = item.dot.value[1]
        const exactMass = state.fixedMassReference !== -1 ? state.fixedMassReference : state.referenceFormulaMz
        const kendrickMass = (mz * Math.round(exactMass)) / exactMass
        const KendrickMassDefect = kendrickMass - Math.floor(kendrickMass)
        rows.push([
          dataset?.value?.name,
          dataset?.value?.id,
          state.x,
          state.y,
          mz,
          int,
          KendrickMassDefect,
          item.isAnnotated,
        ])
      })

      const csv = rows.map((e: any) => e.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
      FileSaver.saveAs(blob, `${dataset?.value?.name.replace(/\s/g, '_')}_plot.csv`)
    }

    const requestIonImage = async (mzValue: number | undefined = state.mzmScoreFilter) => {
      try {
        state.imageLoading = true
        state.mz = mzValue
        state.mzLow = mzValue! - mzValue! * state.mzmShiftFilter! * 1e-6 // ppm
        state.mzHigh = mzValue! + mzValue! * state.mzmShiftFilter! * 1e-6 // ppm
        imageQueryOptions.enabled = true
      } catch (e) {
        reportError(e)
      } finally {
        state.imageLoading = false
      }
    }

    onInitialPeakResult(async (result) => {
      if (result?.data?.initialPeak && dataset.value) {
        const { mz, x, y } = result.data.initialPeak
        const config = safeJsonParse(dataset.value?.configJson)
        const ppm = get(config, 'image_generation.ppm') || 3

        state.mzmScoreFilter = mz
        state.mzmShiftFilter = ppm
        state.mzmScaleFilter = 'ppm'
        state.showFullTIC = false
        state.normalizationData['showFullTIC'] = false
        state.x = x
        state.y = y

        await requestIonImage(mz)
        buildMetadata(dataset.value)
        await requestSpectrum(x, y)
      }
    })

    onAnnotationsResult(async (result) => {
      if (dataset.value && result) {
        if (result.data?.allAnnotations?.length === 0) {
          peakQueryOptions.enabled = true
          return
        }
        // Fallback: if initial peak hasn't loaded yet, use first annotation
        if (!state.mzmScoreFilter) {
          const mz = result.data?.allAnnotations[0]?.mz
          const config = safeJsonParse(dataset.value?.configJson)
          const ppm = get(config, 'image_generation.ppm') || 3

          state.mzmScoreFilter = mz
          state.mzmShiftFilter = ppm
          state.mzmScaleFilter = 'ppm'
          await requestIonImage()
        }

        buildMetadata(dataset.value)

        if (spectrumResult.value) {
          buildChartData(pixelSpectrum.value?.ints, pixelSpectrum.value?.mzs)
        } else {
          state.chartLoading = false
        }
      }
      queryOptions.enabled = false
    })

    const metadata: any = computed(() => {
      let metadataAux = {}

      if (dataset.value) {
        metadataAux = {
          Submitter: dataset.value.submitter,
          PI: dataset.value.principalInvestigator,
          Group: dataset.value.group,
          Projects: dataset.value.projects,
        }
        metadataAux = Object.assign(safeJsonParse(dataset.value.metadataJson), metadataAux)
      }

      return metadataAux
    })

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
      if (metadata.value && metadata.value.MS_Analysis != null && metadata.value.MS_Analysis.Pixel_Size != null) {
        return metadata.value.MS_Analysis.Pixel_Size.Xaxis
      }
      return 0
    }

    const getPixelSizeY = () => {
      if (metadata.value && metadata.value.MS_Analysis != null && metadata.value.MS_Analysis.Pixel_Size != null) {
        return metadata.value.MS_Analysis.Pixel_Size.Yaxis
      }
      return 0
    }

    const handlePixelSelect = (coordinates: any) => {
      requestSpectrum(coordinates.x, coordinates.y)
    }

    const handleColormapChange = (colormap: any) => {
      state.globalImageSettings.colormap = colormap
    }

    const handleScaleBarColorChange = (scaleBarColor: any) => {
      state.globalImageSettings.scaleBarColor = scaleBarColor
    }

    const handleScaleTypeChange = (scaleType: any) => {
      state.globalImageSettings.scaleType = scaleType
    }

    const handleNormalizationChange = (isNormalized: any) => {
      state.globalImageSettings.isNormalized = isNormalized
    }

    const toggleOpticalImage = () => {
      state.showOpticalImage = !state.showOpticalImage
    }

    const handleNormalization = (isNormalized: boolean) => {
      state.globalImageSettings.isNormalized = !state.showFullTIC && isNormalized
    }

    const isRefPeakActive = computed(() => state.refMzLow != null && state.refMzHigh != null)

    const toggleReferencePeak = (checked: boolean) => {
      if (checked) {
        state.refMzLow = state.mzLow
        state.refMzHigh = state.mzHigh
      } else {
        state.refMzLow = undefined
        state.refMzHigh = undefined
      }
      imageQueryOptions.enabled = true
    }

    const fetchDatasets = async (query: string) => {
      state.datasetName = query
    }

    const renderDatasetFilters = () => {
      const dsOptions = uniqBy(datasetOptions.value?.concat([state.selectedDataset]), 'id')
      return (
        <div class="dataset-browser-holder-filter-box py-0">
          <p class="font-semibold">Dataset filters</p>
          {state.selectedDataset && (
            <ElSelect
              class="w-full"
              modelValue={state.selectedDataset?.id}
              remoteMethod={fetchDatasets}
              filterable
              remote
              fitInputWidth
              loading={datasetLoading.value}
              size="small"
              placeholder="Start typing dataset name"
              loadingText="Loading matching entries..."
              noMatchText="No matches"
              onChange={(datasetId: string) => {
                router.push({
                  name: 'dataset-browser',
                  params: { dataset_id: datasetId },
                })
              }}
            >
              {dsOptions.map((ds: any) => (
                <ElOption label={ds?.name} value={ds?.id} />
              ))}
            </ElSelect>
          )}
        </div>
      )
    }

    const renderBrowsingFilters = () => {
      return (
        <div class="dataset-browser-holder-filter-box">
          <p class="font-semibold">Browsing filters</p>
          <div class="filter-holder justify-between">
            <ElRadioGroup
              class="w-3/5"
              onChange={(value: any) => {
                state.peakFilter = value

                if (dataset.value && state.databaseFilter === undefined) {
                  state.databaseFilter = dataset.value.databases[0].id
                }

                if (value === PEAK_FILTER.FDR && !state.fdrFilter) {
                  state.fdrFilter = 0.05
                } else if (value === PEAK_FILTER.ALL) {
                  // state.fdrFilter = undefined
                  // state.databaseFilter = undefined
                }
                if (state.x !== undefined && state.y !== undefined) {
                  queryOptions.enabled = true
                }
              }}
              modelValue={state.peakFilter}
              size="small"
            >
              <ElRadio class="w-full" label={PEAK_FILTER.ALL}>
                All peaks
              </ElRadio>
              <ElRadio class="w-full mt-1 " label={PEAK_FILTER.OFF}>
                Unannotated peaks
              </ElRadio>
              <div class="flex">
                <ElRadio class="mr-1" label={PEAK_FILTER.FDR}>
                  Show annotated at FDR:
                </ElRadio>
                <ElSelect
                  class="select-box-mini"
                  modelValue={state.fdrFilter}
                  onChange={(value: number) => {
                    state.fdrFilter = value
                    state.peakFilter = PEAK_FILTER.FDR
                    if (state.x !== undefined && state.y !== undefined) {
                      queryOptions.enabled = true
                    }
                  }}
                  placeholder="5%"
                  size="small"
                >
                  <ElOption label="5%" value={0.05} />
                  <ElOption label="10%" value={0.1} />
                  <ElOption label="20%" value={0.2} />
                  <ElOption label="50%" value={0.5} />
                </ElSelect>
              </div>
            </ElRadioGroup>
            <div class="flex flex-col w-1/4">
              <span class="text-xs">Database</span>
              <ElSelect
                modelValue={state.databaseFilter}
                size="small"
                onChange={(value: number) => {
                  state.databaseFilter = value
                  if (state.x !== undefined && state.y !== undefined) {
                    queryOptions.enabled = true
                  }
                }}
                placeholder="HMDB - v4"
              >
                {dataset.value &&
                  dataset.value.databases.map((database: any) => {
                    return <ElOption label={`${database.name} - ${database.version}`} value={database.id} />
                  })}
                <ElOption label="All databases" value={''} />
              </ElSelect>
            </div>
          </div>
          <FadeTransition>
            <div
              class="flex flex-row w-full items-start mt-1 flex-wrap"
              style={{
                visibility: state.currentView === VIEWS.KENDRICK ? 'visible' : 'hidden',
              }}
            >
              <div class="font-semibold w-full">Mass reference</div>
              <ElSelect
                class="reference-box mr-4"
                modelValue={state.fixedMassReference}
                onChange={(value: number) => {
                  state.fixedMassReference = value
                  if (value !== -1) {
                    buildChartData(pixelSpectrum.value?.ints, pixelSpectrum.value?.mzs)
                  }
                }}
                placeholder="CH2"
                size="small"
              >
                <ElOption label="CH2" value={14.01565006} />
                <ElOption label="13C" value={1.00335484} />
                <ElOption label="Unsaturation" value={2.015650064} />
                <ElOption label="Deuterium" value={1.006276745} />
                <ElOption label="Other" value={-1} />
              </ElSelect>
              <div
                class="flex flex-1 flex-col"
                style={{ visibility: state.fixedMassReference === -1 ? 'visible' : 'hidden' }}
              >
                <ElInput
                  class={'max-formula-input' + (state.invalidReferenceFormula ? ' formula-input-error' : '')}
                  modelValue={state.referenceFormula}
                  onChange={(value: string) => {
                    if (value && !isFormulaValid(value)) {
                      state.invalidReferenceFormula = true
                    } else {
                      state.invalidReferenceFormula = false
                    }
                    state.referenceFormula = value

                    const { referenceFormula }: any = state
                    if (!state.invalidReferenceFormula) {
                      const newMz = calculateMzFromFormula(referenceFormula as string, dataset.value?.polarity)
                      state.referenceFormulaMz = newMz
                      buildChartData(pixelSpectrum.value?.ints, pixelSpectrum.value?.mzs)
                    }
                  }}
                  size="small"
                  placeholder="Type the formula"
                />
                <span
                  class="error-message"
                  style={{ visibility: !state.invalidReferenceFormula ? 'hidden' : 'visible' }}
                >
                  Invalid formula!
                </span>
              </div>
            </div>
          </FadeTransition>
        </div>
      )
    }

    const renderTitle = () => {
      return (
        <div
          class="flex items-center w-full justify-center py-2"
          style={{ height: '40px', maxWidth: 'calc(100% - 40px)' }}
        >
          <div class="flex flex-row justify-center items-start">
            <span class="text-xl w-full text-center py-2 break-all whitespace-normal overflow-hidden">
              {state.selectedDataset?.name}
            </span>
            <CopyButton class="self-start" text={state.selectedDataset?.name}>
              Copy name to clipboard
            </CopyButton>
          </div>
        </div>
      )
    }

    const renderInfo = () => {
      const { annotation } = state

      if (!annotation) {
        return <div class="info" />
      }

      if (state.showFullTIC) {
        return (
          <div class="info flex flex-col items-center">
            {renderTitle()}
            <span class="text-2xl flex items-baseline ml-4">TIC image</span>
            <div
              class="flex items-baseline ml-4 w-full justify-center items-center text-xl"
              style={{ visibility: state.x === undefined && state.y === undefined ? 'hidden' : 'visible' }}
            >
              {`X: ${state.x}, Y: ${state.y}`}
            </div>
          </div>
        )
      }

      // @ts-ignore TS2604
      const candidateMolecules = () => (
        <CandidateMoleculesPopover
          placement="bottom"
          style={{ display: !annotation?.ion ? 'none' : '' }}
          possibleCompounds={annotation?.possibleCompounds || []}
          isomers={annotation?.isomers}
          isobars={annotation?.isobars}
        >
          <MolecularFormula class="sf-big text-2xl" ion={annotation?.ion || '-'} />
        </CandidateMoleculesPopover>
      )

      return (
        <div class="info">
          {renderTitle()}
          {candidateMolecules()}
          <CopyButton
            class="ml-1"
            style={{ display: !annotation?.ion ? 'none' : '' }}
            text={annotation?.ion ? parseFormulaAndCharge(annotation?.ion) : '-'}
          >
            Copy ion to clipboard
          </CopyButton>
          <span class="text-2xl flex items-baseline ml-4">
            {annotation.mz.toFixed(4)}
            <span class="ml-1 text-gray-700 text-sm">m/z</span>
            <CopyButton class="self-start" text={annotation.mz.toFixed(4)}>
              Copy m/z to clipboard
            </CopyButton>
          </span>
          <div
            class="flex items-baseline ml-4 w-full justify-center items-center text-xl"
            style={{ visibility: state.x === undefined && state.y === undefined ? 'hidden' : 'visible' }}
          >
            {`X: ${state.x}, Y: ${state.y}`}
          </div>
        </div>
      )
    }

    const renderImageFilters = () => {
      return (
        <div class="dataset-browser-holder-filter-box">
          <p class="font-semibold">Image filters</p>
          <div class="filter-holder">
            <span class="label">m/z</span>
            <ElInputNumber
              modelValue={state.showFullTIC ? undefined : state.mzmScoreFilter}
              onChange={(value: number) => {
                if (value) {
                  state.showFullTIC = false
                  state.normalizationData = {
                    data: null,
                    shape: null,
                    metadata: null,
                    showFullTIC: null,
                    type: 'TIC',
                    error: true,
                  }
                }
                state.mzmScoreFilter = value
                if (state.moleculeFilter) {
                  state.moleculeFilter = undefined
                  state.invalidFormula = false
                }
                requestIonImage()
              }}
              precision={4}
              step={0.0001}
              size="small"
              placeholder="174.0408"
            />
            <span class="mx-1">+-</span>
            <ElInputNumber
              class="mr-2 select-box"
              modelValue={state.mzmShiftFilter}
              onChange={(value: number) => {
                state.mzmShiftFilter = value
                state.moleculeFilter = undefined
                requestIonImage()
              }}
              precision={0}
              step={1}
              min={1}
              size="small"
              placeholder="2.5"
            />
            <ElSelect
              class="select-box-mini ml-px"
              modelValue={state.mzmScaleFilter}
              onChange={(value: string) => {
                state.mzmScaleFilter = value
                state.moleculeFilter = undefined
                requestIonImage()
              }}
              size="small"
              placeholder="ppm"
            >
              <ElOption label="ppm" value="ppm" />
            </ElSelect>
          </div>
          <div class="flex flex-row w-full items-start mt-2">
            <span class="label">Formula</span>
            <div class="formula-input-wrapper">
              <ElInput
                class={'formula-input' + (state.invalidFormula ? ' formula-input-error' : '')}
                modelValue={state.moleculeFilter}
                onInput={(value: string) => {
                  if (value && !isFormulaValid(value)) {
                    state.invalidFormula = true
                  } else {
                    state.invalidFormula = false
                  }
                  state.moleculeFilter = value
                }}
                onChange={() => {
                  const { moleculeFilter }: any = state
                  if (!state.invalidFormula) {
                    const newMz = calculateMzFromFormula(moleculeFilter as string, dataset.value?.polarity)
                    state.mzmScoreFilter = newMz
                    requestIonImage(newMz)
                  }
                }}
                size="small"
                placeholder="H2O+H"
              />
              <span class="error-message" style={{ visibility: !state.invalidFormula ? 'hidden' : 'visible' }}>
                Invalid formula!
              </span>
            </div>
          </div>
          {state.mz != null && !state.showFullTIC && (
            <div class="flex items-center mt-2">
              <ElCheckbox modelValue={isRefPeakActive.value} onChange={(val: boolean) => toggleReferencePeak(val)}>
                {isRefPeakActive.value
                  ? `Normalizing to reference peak (m/z ${((state.refMzLow! + state.refMzHigh!) / 2).toFixed(4)})`
                  : `Normalize to this peak (m/z ${state.mz!.toFixed(4)})`}
              </ElCheckbox>
            </div>
          )}
        </div>
      )
    }

    const renderEmptySpectrum = () => {
      return (
        <div class="dataset-browser-empty-spectrum">
          <ElIcon class="info-icon mr-6">
            <InfoFilled />
          </ElIcon>
          <div class="flex flex-col text-xs w-3/4">
            <p class="font-semibold mb-2">Steps:</p>
            <p>1 - Select a pixel on the image viewer</p>
            <p>2 - Apply the filter you desire</p>
            <p>3 - The interaction is multi-way, so you can also update the ion image via spectrum interaction</p>
          </div>
        </div>
      )
    }

    const renderChartOptions = () => {
      return (
        <ElRadioGroup
          size="small"
          class="w-full flex ml-4"
          onChange={(value: any) => {
            state.currentView = value
            buildChartData(pixelSpectrum.value?.ints, pixelSpectrum.value?.mzs)
          }}
          modelValue={state.currentView}
        >
          <ElRadioButton class="ml-2" label={VIEWS.SPECTRUM} />
          <ElRadioButton label={VIEWS.KENDRICK} />
        </ElRadioGroup>
      )
    }

    const renderKmChart = (isEmpty: boolean) => {
      return (
        <DatasetBrowserKendrickPlot
          style={{
            visibility: state.currentView === VIEWS.KENDRICK ? '' : 'hidden',
            height: state.currentView === VIEWS.KENDRICK ? '' : 0,
          }}
          isEmpty={isEmpty}
          isLoading={state.chartLoading}
          isDataLoading={annotationsLoading.value}
          data={state.sampleData}
          dataRange={state.dataRange}
          annotatedData={annotatedPeaks.value}
          peakFilter={state.peakFilter}
          referenceMz={state.fixedMassReference !== -1 ? state.fixedMassReference : state.referenceFormulaMz}
          onItemSelected={(mz: number) => {
            state.showFullTIC = false
            state.normalizationData['showFullTIC'] = false
            state.mzmScoreFilter = mz
            requestIonImage()
          }}
          onDownload={handleDownload}
          annotatedLabel={`Annotated at FDR ${(state.fdrFilter || 1) * 100}%`}
        />
      )
    }

    const renderSpectrum = (isEmpty: boolean) => {
      return (
        <DatasetBrowserSpectrumChart
          style={{
            visibility: state.currentView === VIEWS.SPECTRUM ? '' : 'hidden',
            height: state.currentView === VIEWS.SPECTRUM ? '' : 0,
          }}
          isEmpty={isEmpty}
          normalization={state.globalImageSettings.isNormalized ? state.normalization : undefined}
          isLoading={state.chartLoading}
          isDataLoading={annotationsLoading.value}
          data={state.sampleData}
          annotatedData={annotatedPeaks.value}
          peakFilter={state.peakFilter}
          dataRange={state.dataRange}
          onItemSelected={(mz: number) => {
            state.showFullTIC = false
            state.normalizationData['showFullTIC'] = false
            state.mzmScoreFilter = mz
            requestIonImage()
          }}
          annotatedLabel={`Annotated @ FDR ${(state.fdrFilter || 1) * 100}%`}
          onDownload={handleDownload}
        />
      )
    }

    return () => {
      const isEmpty = state.x === undefined && state.y === undefined

      return (
        <div class={'dataset-browser-container'}>
          <div class={'dataset-browser-wrapper w-full lg:w-1/2'}>
            <div class="dataset-browser-holder">
              <div class="dataset-browser-holder-header">Spectrum browser</div>
              {renderDatasetFilters()}
              {renderBrowsingFilters()}
              {!state.noData && renderChartOptions()}
              {isEmpty && !state.chartLoading && renderEmptySpectrum()}
              {state.currentView === VIEWS.KENDRICK && !state.noData && renderKmChart(isEmpty)}
              {state.currentView === VIEWS.SPECTRUM && !state.noData && renderSpectrum(isEmpty)}
            </div>
          </div>
          <div class="dataset-browser-wrapper w-full lg:w-1/2">
            <div class="dataset-browser-holder">
              <div class="dataset-browser-holder-header">Image viewer</div>
              {renderImageFilters()}
              {renderInfo()}
              <MainImageHeader
                class="viewer-item-header dom-to-image-hidden"
                annotation={state.annotation}
                slot="title"
                isActive={false}
                hideOptions={false}
                hideTitle
                hideNormalization
                showOpticalImage={state.showOpticalImage}
                toggleOpticalImage={toggleOpticalImage}
                onColormapChange={handleColormapChange}
                onScaleBarColorChange={handleScaleBarColorChange}
                onScaleTypeChange={handleScaleTypeChange}
                onNormalizationChange={handleNormalizationChange}
                lockedIntensityTemplate={state.globalImageSettings.selectedLockTemplate}
                globalLockedIntensities={state.globalImageSettings.globalLockedIntensities}
                hasOpticalImage={state.annotation?.dataset?.opticalImages[0]?.url !== undefined}
                resetViewport={() => {
                  state.globalImageSettings.resetViewPort = true
                  setTimeout(() => {
                    state.globalImageSettings.resetViewPort = false
                  }, 500)
                }}
              />
              <div ref={container} class="ion-image-holder">
                {(annotationsLoading.value || state.imageLoading || state.chartLoading) && (
                  <div class="loader-holder">
                    <div>
                      <ElIcon class="is-loading">
                        <Loading />
                      </ElIcon>
                    </div>
                  </div>
                )}
                {state.annotation && (
                  <SimpleIonImageViewer
                    annotations={[state.annotation]}
                    forceUpdate
                    hideClipping={state.showFullTIC}
                    dataset={dataset.value}
                    height={dimensions.height}
                    width={dimensions.width}
                    ionImageUrl={state.ionImageUrl}
                    pixelSizeX={getPixelSizeX()}
                    pixelSizeY={getPixelSizeY()}
                    normalizationData={state.normalizationData}
                    keepPixelSelected
                    resetViewPort={state.globalImageSettings.resetViewPort}
                    showOpticalImage={state.showOpticalImage}
                    onPixelSelected={handlePixelSelect}
                    onNormalization={handleNormalization}
                    colormap={state.globalImageSettings.colormap}
                    scaleType={state.globalImageSettings.scaleType}
                    scaleBarColor={state.globalImageSettings.scaleBarColor}
                    isNormalized={state.showFullTIC || state.globalImageSettings.isNormalized}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }
  },
})
