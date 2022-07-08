import { computed, defineComponent, reactive } from '@vue/composition-api'
import { Select, Option, RadioGroup, Radio, InputNumber, Input, RadioButton } from '../../../lib/element-ui'
import { useQuery } from '@vue/apollo-composable'
import {
  checkIfHasBrowserFiles, getBrowserImage,
  GetDatasetByIdQuery,
  getDatasetByIdWithPathQuery,
  getDatasetDiagnosticsQuery, getSpectrum,
} from '../../../api/dataset'
import { annotationListQuery } from '../../../api/annotation'
import config from '../../../lib/config'
import safeJsonParse from '../../../lib/safeJsonParse'
import { DatasetBrowserSpectrumChart } from './DatasetBrowserSpectrumChart'
import './DatasetBrowserPage.scss'
import SimpleIonImageViewer from './SimpleIonImageViewer'
import { calculateMzFromFormula, isFormulaValid } from '../../../lib/formulaParser'
import reportError from '../../../lib/reportError'
import { readNpy } from '../../../lib/npyHandler'
import { DatasetBrowserKendrickPlot } from './DatasetBrowserKendrickPlot'
import FadeTransition from '../../../components/FadeTransition'
import CandidateMoleculesPopover from '../../Annotations/annotation-widgets/CandidateMoleculesPopover.vue'
import MolecularFormula from '../../../components/MolecularFormula'
import CopyButton from '../../../components/CopyButton.vue'
import Vue from 'vue'
import FileSaver from 'file-saver'

interface DatasetBrowserProps {
  className: string
}

interface DatasetBrowserState {
  peakFilter: number
  fdrFilter: number | undefined
  moleculeFilter: string | undefined
  databaseFilter: number | string | undefined
  mzmScoreFilter: number | undefined
  mzmPolarityFilter: number | undefined
  mzmScaleFilter: string | undefined
  ionImageUrl: any
  sampleData: any[]
  chartLoading: boolean
  imageLoading: boolean
  isNormalized: boolean
  invalidFormula: boolean
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
  mz: number | undefined,
  mzLow: number | undefined,
  mzHigh: number | undefined,
  enableImageQuery: boolean,
}

const PEAK_FILTER = {
  ALL: 1,
  FDR: 2,
  OFF: 3,
}

const VIEWS = {
  SPECTRUM: 'Peak chart',
  KENDRICK: 'Kendrick plot',
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
    const state = reactive<DatasetBrowserState>({
      peakFilter: PEAK_FILTER.ALL,
      fdrFilter: undefined,
      databaseFilter: undefined,
      mzmScoreFilter: undefined,
      mzmPolarityFilter: undefined,
      mzmScaleFilter: undefined,
      metadata: undefined,
      annotation: undefined,
      chartLoading: false,
      isNormalized: false,
      imageLoading: false,
      moleculeFilter: undefined,
      x: undefined,
      y: undefined,
      ionImageUrl: undefined,
      sampleData: [],
      normalizationData: {},
      invalidFormula: false,
      invalidReferenceFormula: false,
      referenceFormula: undefined,
      fixedMassReference: 14.01565006, // m_CH2=14.0156,
      referenceFormulaMz: 14.01565006, // m_CH2=14.0156,
      currentView: VIEWS.KENDRICK,
      showFullTIC: true,
      normalization: undefined,
      mz: undefined,
      mzLow: undefined,
      mzHigh: undefined,
      enableImageQuery: false,
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
      onResult: onDatasetsResult,
    } = useQuery<GetDatasetByIdQuery>(getDatasetByIdWithPathQuery, {
      id: datasetId,
    })

    onDatasetsResult(async(result) => {
      try {
        const dataset = result!.data.dataset
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
      }
    })

    const queryOptions = reactive({ enabled: true, fetchPolicy: 'no-cache' as const })
    const queryVars = computed(() => ({
      ...queryVariables(),
      filter: { ...queryVariables().filter, fdrLevel: state.fdrFilter, databaseId: state.databaseFilter },
      dFilter: { ...queryVariables().dFilter, ids: datasetId },
    }))

    const imageQueryOptions = reactive({ enabled: false, fetchPolicy: 'no-cache' as const })

    const {
      result: browserResult,
      onResult: onImageResult,
    } = useQuery<any>(getBrowserImage, () => ({ datasetId: datasetId, mzLow: state.mzLow, mzHigh: state.mzHigh }),
      imageQueryOptions)

    const spectrumQueryOptions = reactive({ enabled: false, fetchPolicy: 'no-cache' as const })

    const {
      result: spectrumResult,
      onResult: onSpectrumResult,
    } = useQuery<any>(getSpectrum, () => ({ datasetId: datasetId, x: state.x, y: state.y }),
      spectrumQueryOptions)

    onSpectrumResult(async(result) => {
      if (result && result.data && result.data.pixelSpectrum) {
        state.sampleData = [{ ints: result.data.pixelSpectrum.ints, mzs: result.data.pixelSpectrum.mzs }]
      }
      state.chartLoading = false
    })

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

    onImageResult(async(result) => {
      if (result?.data?.browserImage) {
        const blob = b64toBlob(result?.data?.browserImage.replace('data:image/png;base64,', ''), 'image/png')
        state.ionImageUrl = URL.createObjectURL(blob)
        state.annotation = {
          ...annotations.value[0],
          mz: state.mz,
          isotopeImages: [
            {
              ...annotations.value[0].isotopeImages[0],
              mz: state.mz,
              url: state.ionImageUrl,
            },
          ],
        }
      }
    })

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
        return annotations.value.map((annot: any) => {
          return {
            possibleCompounds: annot.possibleCompounds,
            mz: annot.mz,
          }
        })
      }
      return []
    })

    const requestSpectrum = async(x: number = 0, y: number = 0) => {
      try {
        state.chartLoading = true
        state.x = x
        state.y = y
        spectrumQueryOptions.enabled = true
        const i = (y * state.normalizationData.shape[1]) + x
        const ticPixel = state.normalizationData.data[i]
        state.normalization = ticPixel
      } catch (e) {
        reportError(e)
      }
    }

    const handleDownload = () => {
      const cols = ['dataset_name', 'dataset_id', 'x', 'y', 'mz', 'intensity', 'mass_reference', 'KMD']
      const rows = [cols]

      state.sampleData[0].mzs.forEach((mz: any, idx: number) => {
        const exactMass = state.fixedMassReference !== -1 ? state.fixedMassReference : state.referenceFormulaMz
        const kendrickMass = mz * Math.round(exactMass) / exactMass
        const KendrickMassDefect = kendrickMass - Math.floor(kendrickMass)
        rows.push([dataset?.value?.name, dataset?.value?.id, state.sampleData[0].x,
          state.sampleData[0].y, mz, state.sampleData[0].ints[idx], exactMass, KendrickMassDefect])
      })

      const csv = rows.map((e: any) => e.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
      FileSaver.saveAs(blob, `${dataset?.value?.name.replace(/\s/g, '_')}_plot.csv`)
    }

    const requestIonImage = async(mzValue : number | undefined = state.mzmScoreFilter) => {
      try {
        state.imageLoading = true
        state.mz = mzValue
        state.mzLow = mzValue! - state.mzmPolarityFilter!
        state.mzHigh = mzValue! + state.mzmPolarityFilter!
        imageQueryOptions.enabled = true
      } catch (e) {
        reportError(e)
      } finally {
        state.imageLoading = false
      }
    }

    onAnnotationsResult(async(result) => {
      if (dataset.value && result) {
        if (!state.mzmScoreFilter) {
          const mz = result.data.allAnnotations[0].mz
          const ppm = 3
          state.mzmScoreFilter = mz
          state.mzmPolarityFilter = ppm
          state.mzmScaleFilter = 'ppm'
        }
        await requestIonImage()
        buildMetadata(dataset.value)
        if (state.x !== undefined && state.y !== undefined) {
          await requestSpectrum(state.x, state.y)
        }
      }
      queryOptions.enabled = false
    })

    const metadata : any = computed(() => {
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
      if (metadata.value && metadata.value.MS_Analysis != null
        && metadata.value.MS_Analysis.Pixel_Size != null) {
        return metadata.value.MS_Analysis.Pixel_Size.Xaxis
      }
      return 0
    }

    const getPixelSizeY = () => {
      if (metadata.value && metadata.value.MS_Analysis != null
        && metadata.value.MS_Analysis.Pixel_Size != null) {
        return metadata.value.MS_Analysis.Pixel_Size.Yaxis
      }
      return 0
    }

    const handlePixelSelect = (coordinates: any) => {
      requestSpectrum(coordinates.x, coordinates.y)
    }

    const handleNormalization = (isNormalized: boolean) => {
      state.isNormalized = !state.showFullTIC && isNormalized
    }

    const renderBrowsingFilters = () => {
      return (
        <div class='dataset-browser-holder-filter-box'>
          <p class='font-semibold'>Browsing filters</p>
          <div class='filter-holder justify-between'>
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
              onChange={() => {
                if (state.x !== undefined && state.y !== undefined) {
                  queryOptions.enabled = true
                }
              }}
              value={state.peakFilter}
              size='mini'>
              <Radio class='w-full' label={PEAK_FILTER.ALL}>All Peaks</Radio>
              <Radio class='w-full mt-1 ' label={PEAK_FILTER.OFF}>Unannotated Peaks</Radio>
              <div>
                <Radio label={PEAK_FILTER.FDR}>Show annotated at FDR</Radio>
                <Select
                  class='select-box-mini'
                  value={state.fdrFilter}
                  onChange={(value: number) => {
                    state.fdrFilter = value
                    state.peakFilter = PEAK_FILTER.FDR
                    if (state.x !== undefined && state.y !== undefined) {
                      queryOptions.enabled = true
                    }
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
                  if (state.x !== undefined && state.y !== undefined) {
                    queryOptions.enabled = true
                  }
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
          <FadeTransition>
            <div
              class='flex flex-row w-full items-start mt-4 flex-wrap'
              style={{
                visibility: state.currentView === VIEWS.KENDRICK ? '' : 'hidden',
              }}>
              <div class='font-semibold w-full'>Mass reference</div>
              <Select
                class='reference-box mr-4'
                value={state.fixedMassReference}
                onChange={(value: number) => {
                  state.fixedMassReference = value
                }}
                placeholder='CH2'
                size='mini'>
                <Option label="CH2" value={14.01565006}/>
                <Option label="13C" value={1.00335484}/>
                <Option label="Unsaturation" value={2.015650064}/>
                <Option label="Deuterium" value={1.006276745}/>
                <Option label="Other" value={-1}/>
              </Select>
              <div class='flex flex-1 flex-col' style={{ visibility: state.fixedMassReference === -1 ? '' : 'hidden' }}>
                <Input
                  class={'max-formula-input' + (state.invalidReferenceFormula ? ' formula-input-error' : '')}
                  value={state.referenceFormula}
                  onInput={(value: string) => {
                    if (value && !isFormulaValid(value)) {
                      state.invalidReferenceFormula = true
                    } else {
                      state.invalidReferenceFormula = false
                    }
                    state.referenceFormula = value
                  }}
                  onChange={() => {
                    const { referenceFormula } : any = state
                    if (!state.invalidReferenceFormula) {
                      const newMz = calculateMzFromFormula(referenceFormula as string, dataset.value?.polarity)
                      state.referenceFormulaMz = newMz
                    }
                  }}
                  size='mini'
                  placeholder='Type the formula'
                />
                <span class='error-message' style={{ visibility: !state.invalidReferenceFormula ? 'hidden' : '' }}>
                Invalid formula!
                </span>
              </div>
            </div>
          </FadeTransition>
        </div>
      )
    }

    const renderInfo = () => {
      const { annotation } = state

      if (!annotation) {
        return null
      }

      if (state.showFullTIC) {
        return (
          <div class='info'>
            <span class="text-2xl flex items-baseline ml-4">
                TIC image
            </span>
            <div class="flex items-baseline ml-4 w-full justify-center items-center text-xl"
              style={{ visibility: state.x === undefined && state.y === undefined ? 'hidden' : '' }}>
              {`X: ${state.x}, Y: ${state.y}`}
            </div>
          </div>
        )
      }

      // @ts-ignore TS2604
      const candidateMolecules = () => <CandidateMoleculesPopover
        placement="bottom"
        possibleCompounds={annotation.possibleCompounds}
        isomers={annotation.isomers}
        isobars={annotation.isobars}>
        <MolecularFormula
          class="sf-big text-2xl"
          ion={annotation.ion}
        />
      </CandidateMoleculesPopover>

      return (
        <div class='info'>
          {candidateMolecules()}
          <CopyButton
            class="ml-1"
            text={annotation.ion}>
            Copy ion to clipboard
          </CopyButton>
          <span class="text-2xl flex items-baseline ml-4">
            { annotation.mz.toFixed(4) }
            <span class="ml-1 text-gray-700 text-sm">m/z</span>
            <CopyButton
              class="self-start"
              text={annotation.mz.toFixed(4)}>
              Copy m/z to clipboard
            </CopyButton>
          </span>
          <div class="flex items-baseline ml-4 w-full justify-center items-center text-xl"
            style={{ visibility: state.x === undefined && state.y === undefined ? 'hidden' : '' }}>
            {`X: ${state.x}, Y: ${state.y}`}
          </div>
        </div>
      )
    }

    const renderImageFilters = () => {
      return (
        <div class='dataset-browser-holder-filter-box'>
          <p class='font-semibold'>Image filters</p>
          <div class='filter-holder'>
            <span class='label'>m/z</span>
            <InputNumber
              value={state.showFullTIC ? undefined : state.mzmScoreFilter}
              onInput={(value: number) => {
                if (value) {
                  state.showFullTIC = false
                  Vue.set(state.normalizationData, 'showFullTIC', false)
                }
                state.mzmScoreFilter = value
              }}
              onChange={() => {
                if (state.moleculeFilter) {
                  state.moleculeFilter = undefined
                  state.invalidFormula = false
                }
                requestIonImage()
              }}
              precision={4}
              step={0.0001}
              size='mini'
              placeholder='174.0408'
            />
            <span class='mx-1'>+-</span>
            <InputNumber
              class='mr-2 select-box'
              value={state.mzmPolarityFilter}
              onInput={(value: number) => {
                state.mzmPolarityFilter = value
                state.moleculeFilter = undefined
              }}
              onChange={() => {
                requestIonImage()
              }}
              precision={2}
              step={0.01}
              size='mini'
              placeholder='2.5'
            />
            <Select
              class='select-box-mini ml-px'
              value={state.mzmScaleFilter}
              onChange={(value: string) => {
                state.mzmScaleFilter = value
                state.moleculeFilter = undefined
                requestIonImage()
              }}
              size='mini'
              placeholder='ppm'>
              <Option label="DA" value='DA'/>
              <Option label="ppm" value='ppm'/>
            </Select>
          </div>
          <div class='flex flex-row w-full items-start mt-2'>
            <span class='label'>Formula</span>
            <div class='formula-input-wrapper'>
              <Input
                class={'formula-input' + (state.invalidFormula ? ' formula-input-error' : '')}
                value={state.moleculeFilter}
                onInput={(value: string) => {
                  if (value && !isFormulaValid(value)) {
                    state.invalidFormula = true
                  } else {
                    state.invalidFormula = false
                  }
                  state.moleculeFilter = value
                }}
                onChange={() => {
                  const { moleculeFilter } : any = state
                  if (!state.invalidFormula) {
                    const newMz = calculateMzFromFormula(moleculeFilter as string, dataset.value?.polarity)
                    state.mzmScoreFilter = newMz
                    requestIonImage(newMz)
                  }
                }}
                size='mini'
                placeholder='H2O+H'
              />
              <span class='error-message' style={{ visibility: !state.invalidFormula ? 'hidden' : '' }}>
                Invalid formula!
              </span>
            </div>
          </div>
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

    return () => {
      const isEmpty = state.x === undefined && state.y === undefined
      return (
        <div class={'dataset-browser-container'}>
          <div class={'dataset-browser-wrapper w-full lg:w-1/2'}>
            <div class='dataset-browser-holder'>
              <div class='dataset-browser-holder-header'>
                Spectrum browser
              </div>
              {renderBrowsingFilters()}
              <RadioGroup
                size='small'
                class='w-full flex ml-4'
                onInput={(value: any) => { state.currentView = value }}
                value={state.currentView}>
                <RadioButton class='ml-2' label={VIEWS.SPECTRUM}/>
                <RadioButton label={VIEWS.KENDRICK}/>
              </RadioGroup>
              {
                isEmpty && !state.chartLoading
                && renderEmptySpectrum()
              }
              <DatasetBrowserKendrickPlot
                style={{
                  visibility: state.currentView === VIEWS.KENDRICK ? '' : 'hidden',
                  height: state.currentView === VIEWS.KENDRICK ? '' : 0,
                }}
                isEmpty={isEmpty}
                isLoading={state.chartLoading}
                isDataLoading={annotationsLoading.value}
                data={state.sampleData}
                annotatedData={annotatedPeaks.value}
                peakFilter={state.peakFilter}
                referenceMz={state.fixedMassReference !== -1 ? state.fixedMassReference : state.referenceFormulaMz}
                onItemSelected={(mz: number) => {
                  state.showFullTIC = false
                  Vue.set(state.normalizationData, 'showFullTIC', false)
                  state.mzmScoreFilter = mz
                  requestIonImage()
                }}
                onDownload={handleDownload}
              />
              <DatasetBrowserSpectrumChart
                style={{
                  visibility: state.currentView === VIEWS.SPECTRUM ? '' : 'hidden',
                  height: state.currentView === VIEWS.SPECTRUM ? '' : 0,
                }}
                isEmpty={isEmpty}
                normalization={state.isNormalized ? state.normalization : undefined}
                isLoading={state.chartLoading}
                isDataLoading={annotationsLoading.value}
                data={state.sampleData}
                annotatedData={annotatedPeaks.value}
                peakFilter={state.peakFilter}
                onItemSelected={(mz: number) => {
                  state.showFullTIC = false
                  Vue.set(state.normalizationData, 'showFullTIC', false)
                  state.mzmScoreFilter = mz
                  requestIonImage()
                }}
                onDownload={handleDownload}
              />
            </div>
          </div>
          <div class='dataset-browser-wrapper w-full lg:w-1/2'>
            <div class='dataset-browser-holder'>
              <div class='dataset-browser-holder-header'>
                Image viewer
              </div>
              {renderImageFilters()}
              {renderInfo()}
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
                  state.annotation
                  && <SimpleIonImageViewer
                    annotation={state.annotation}
                    dataset={dataset.value}
                    ionImageUrl={state.ionImageUrl}
                    pixelSizeX={getPixelSizeX()}
                    pixelSizeY={getPixelSizeY()}
                    isNormalized={state.showFullTIC}
                    normalizationData={state.normalizationData}
                    onPixelSelected={handlePixelSelect}
                    onNormalization={handleNormalization}
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
