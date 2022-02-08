import { computed, defineComponent, reactive } from '@vue/composition-api'
import { Select, Option, RadioGroup, Radio, InputNumber, Input, RadioButton } from '../../../lib/element-ui'
import { useQuery } from '@vue/apollo-composable'
import { GetDatasetByIdQuery, getDatasetByIdWithPathQuery, getDatasetDiagnosticsQuery } from '../../../api/dataset'
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
  invalidFormula: boolean
  referenceFormula: any
  invalidReferenceFormula: boolean
  referenceFormulaMz: number
  metadata: any
  annotation: any
  normalizationData: any
  x: number | undefined
  y: number | undefined
  currentView: string
}

const PEAK_FILTER = {
  ALL: 1,
  FDR: 2,
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
      referenceFormulaMz: 14.0156, // m_CH2=14.0156,
      currentView: VIEWS.KENDRICK,
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
          showFullTIC: false,
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
        reportError(e)
      } finally {
        state.chartLoading = false
      }
    }

    const requestIonImage = async(mzValue : number | undefined = state.mzmScoreFilter) => {
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
            mz: mzValue,
            ppm: state.mzmPolarityFilter,
          }),
        })

        const content = await response.blob()
        state.ionImageUrl = URL.createObjectURL(content)
        state.annotation = {
          ...annotations.value[0],
          mz: mzValue,
          isotopeImages: [
            {
              ...annotations.value[0].isotopeImages[0],
              mz: mzValue,
              url: state.ionImageUrl,
            },
          ],
        }
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
              class='flex flex-row w-full items-start mt-4'
              style={{
                visibility: state.currentView === VIEWS.KENDRICK ? '' : 'hidden',
              }}>
              <span class='mass-ref-label mr-1'>Mass reference</span>
              <div class='flex flex-1 flex-col'>
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
                  placeholder='CH2'
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

    const renderImageFilters = () => {
      return (
        <div class='dataset-browser-holder-filter-box'>
          <p class='font-semibold'>Image filters</p>
          <div class='filter-holder'>
            <span class='label'>m/z</span>
            <InputNumber
              value={state.mzmScoreFilter}
              onInput={(value: number) => {
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
                referenceMz={state.referenceFormulaMz}
                onItemSelected={(mz: number) => {
                  state.mzmScoreFilter = mz
                  requestIonImage()
                }}
              />
              <DatasetBrowserSpectrumChart
                style={{
                  visibility: state.currentView === VIEWS.SPECTRUM ? '' : 'hidden',
                  height: state.currentView === VIEWS.SPECTRUM ? '' : 0,
                }}
                isEmpty={isEmpty}
                isLoading={state.chartLoading}
                isDataLoading={annotationsLoading.value}
                data={state.sampleData}
                annotatedData={annotatedPeaks.value}
                peakFilter={state.peakFilter}
                onItemSelected={(mz: number) => {
                  state.mzmScoreFilter = mz
                  requestIonImage()
                }}
              />
            </div>
          </div>
          <div class='dataset-browser-wrapper w-full lg:w-1/2'>
            <div class='dataset-browser-holder'>
              <div class='dataset-browser-holder-header'>
                Image viewer
              </div>
              {renderImageFilters()}
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
                    normalizationData={state.normalizationData}
                    onPixelSelected={handlePixelSelect}
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
