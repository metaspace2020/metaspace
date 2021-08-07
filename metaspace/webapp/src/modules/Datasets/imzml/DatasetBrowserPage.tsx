import { computed, defineComponent, reactive } from '@vue/composition-api'
import { Select, Option, RadioGroup, Radio, InputNumber, Input } from '../../../lib/element-ui'
import { useQuery } from '@vue/apollo-composable'
import { getDatasetByIdQuery, GetDatasetByIdQuery } from '../../../api/dataset'
import { annotationListQuery } from '../../../api/annotation'
import config from '../../../lib/config'
import safeJsonParse from '../../../lib/safeJsonParse'
import MainImage from '../../Annotations/annotation-widgets/default/MainImage.vue'
import MainImageHeader from '../../Annotations/annotation-widgets/default/MainImageHeader.vue'
import FadeTransition from '../../../components/FadeTransition'
import RangeSlider from '../../../components/Slider/RangeSlider.vue'
import IonIntensity from '../../ImageViewer/IonIntensity.vue'
import { loadPngFromUrl, processIonImage, renderScaleBar } from '../../../lib/ionImageRendering'
import { get } from 'lodash-es'
import createColormap from '../../../lib/createColormap'
import getColorScale from '../../../lib/getColorScale'
import { THUMB_WIDTH } from '../../../components/Slider'
import { periodicTable } from './periodicTable'
import Vue from 'vue'
import DatasetBrowserSpectrumChart from './DatasetBrowserSpectrumChart'
import './DatasetBrowserPage.scss'

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
  scaleIntensity: boolean
  ionImageUrl: any
  sampleData: any[]
  chartLoading: boolean
  imageLoading: boolean
  ionImage: any
  rangeSliderStyle: any
  imageSettings: any
  metadata: any
  annotation: any
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
    const state = reactive<DatasetBrowserState>({
      peakFilter: PEAK_FILTER.ALL,
      fdrFilter: undefined,
      databaseFilter: undefined,
      mzmScoreFilter: undefined,
      mzmPolarityFilter: undefined,
      mzmScaleFilter: undefined,
      metadata: undefined,
      ionImage: undefined,
      annotation: undefined,
      rangeSliderStyle: undefined,
      chartLoading: false,
      imageLoading: false,
      scaleIntensity: false,
      imageSettings: undefined,
      moleculeFilter: undefined,
      x: undefined,
      y: undefined,
      ionImageUrl: undefined,
      sampleData: [],
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
      }
    }

    const handleIonIntensityChange = async(intensity: number, type: string) => {
      let minScale = state.imageSettings.userScaling[0]
      let maxScale = state.imageSettings.userScaling[1]

      if (type === 'min') {
        minScale = intensity / state.imageSettings.intensity.max.image
        minScale = minScale > 1 ? 1 : minScale
        minScale = minScale > maxScale ? maxScale : minScale
        minScale = minScale < 0 ? 0 : minScale
      } else {
        maxScale = intensity / state.imageSettings.intensity.max.image
        maxScale = maxScale > 1 ? 1 : maxScale
        maxScale = maxScale < 0 ? 0 : maxScale
        maxScale = maxScale < minScale ? minScale : maxScale
      }

      handleUserScalingChange([minScale, maxScale])
    }

    const handleUserScalingChange = async(userScaling: any) => {
      state.imageSettings.userScaling = userScaling

      const minScale =
        state.imageSettings.intensity?.min?.status === 'LOCKED'
          ? userScaling[0] * (1
          - (state.imageSettings.intensity.min.user / state.imageSettings.intensity.max.image))
          + (state.imageSettings.intensity.min.user / state.imageSettings.intensity.max.image)
          : userScaling[0]

      const maxScale = userScaling[1] * (state.imageSettings.intensity?.max?.status === 'LOCKED'
        ? state.imageSettings.intensity.max.user / state.imageSettings.intensity.max.image : 1)
      const scale = [minScale, maxScale]
      state.imageSettings.imageScaledScaling = scale

      Vue.set(state.imageSettings, 'intensity', {
        ...state.imageSettings.intensity,
        min:
          {
            ...state.imageSettings.intensity.min,
            scaled: state.imageSettings.intensity.max.image * userScaling[0],
          },
        max:
          {
            ...state.imageSettings.intensity.max,
            scaled: state.imageSettings.intensity.max.image * userScaling[1],
          },
      })
    }

    const handleIonIntensityLockChange = async(value: number, type: string) => {
      const minLocked = type === 'min' ? value : state.imageSettings.lockedIntensities[0]
      const maxLocked = type === 'max' ? value : state.imageSettings.lockedIntensities[1]
      const lockedIntensities = [minLocked, maxLocked]
      const intensity = getIntensity(state.ionImage,
        lockedIntensities)

      if (intensity && intensity.max && maxLocked && intensity.max.status === 'LOCKED') {
        intensity.max.scaled = maxLocked
        intensity.max.user = maxLocked
        intensity.max.clipped = maxLocked
      }

      if (intensity && intensity.min && minLocked && intensity.min.status === 'LOCKED') {
        intensity.min.scaled = minLocked
        intensity.min.user = minLocked
        intensity.min.clipped = minLocked
      }

      if (intensity && intensity.min && intensity.min.status !== 'LOCKED'
      ) {
        state.imageSettings.imageScaledScaling = [0, state.imageSettings.imageScaledScaling[1]]
      }
      if (intensity && intensity.max && intensity.max.status !== 'LOCKED') {
        state.imageSettings.imageScaledScaling = [state.imageSettings.imageScaledScaling[0], 1]
      }

      state.imageSettings.lockedIntensities = lockedIntensities
      state.imageSettings.intensity = intensity
      state.imageSettings.userScaling = [0, 1]
    }

    const buildRangeSliderStyle = (scaleRange: number[] = [0, 1]) => {
      const width = 190
      const activeColorMap = state.imageSettings.colormap
      const ionImage = state.ionImage
      const cmap = createColormap(activeColorMap)
      const { range } = getColorScale(activeColorMap)
      const { scaledMinIntensity, scaledMaxIntensity } = ionImage || {}
      const minColor = range[0]
      const maxColor = range[range.length - 1]
      const gradient = scaledMinIntensity === scaledMaxIntensity
        ? `linear-gradient(to right, ${range.join(',')})`
        : ionImage ? `url(${renderScaleBar(ionImage, cmap, true)})` : ''

      state.imageSettings.colorBar = {
        minColor,
        maxColor,
        gradient,
      }

      const [minScale, maxScale] = scaleRange
      const minStop = Math.ceil(THUMB_WIDTH + ((width - THUMB_WIDTH * 2) * minScale))
      const maxStop = Math.ceil(THUMB_WIDTH + ((width - THUMB_WIDTH * 2) * maxScale))
      state.rangeSliderStyle = {
        background: [
          `0px / ${minStop}px 100% linear-gradient(${minColor},${minColor}) no-repeat`,
          `${minStop}px / ${maxStop - minStop}px 100% ${gradient} repeat-y`,
          `${minColor} ${maxStop}px / ${width - maxStop}px 100% linear-gradient(${maxColor},${maxColor}) no-repeat`,
        ].join(','),
      }
    }

    const setIonImage = async() => {
      if (state.ionImageUrl) {
        const ionImagePng = await loadPngFromUrl(state.ionImageUrl)
        const isotopeImage = get(state.annotation, 'isotopeImages[0]')
        const { minIntensity, maxIntensity } = isotopeImage
        state.ionImage = await processIonImage(ionImagePng, minIntensity, maxIntensity,
          state.imageSettings.scaleType)
        state.imageSettings.intensity = getIntensity(state.ionImage)
        buildRangeSliderStyle()
      } else {
        state.ionImage = null
      }
    }

    const parseFormula = (formula: string) => {
      const regexp = /(?<element>[A-Z][a-z]{0,2})(?<n>[0-9]*)/ig
      const elements : any = {}
      Array.from(formula.matchAll(regexp), (res, idx) => {
        if (res.groups && res.groups.element && res.groups.element.length > 1) {
          if (periodicTable[res.groups.element] === undefined) {
            const auxElement = res.groups.element.substring(1, 2)
            const auxElementCount = parseFormula(auxElement
              + (res.groups && res.groups.n ? parseInt(res.groups.n, 10) : 1))

            if (Object.keys(elements).includes(auxElement)) {
              elements[auxElement] += auxElementCount[auxElement]
            } else {
              elements[auxElement] = auxElementCount[auxElement]
            }

            res.groups.element = res.groups.element.substring(0, 1)
            res.groups.n = '1'
          }
        }

        if (res.groups && res.groups.element in Object.keys(elements)) {
          elements[res.groups.element] = elements[res.groups.element]
            + (res.groups && res.groups.n ? parseInt(res.groups.n, 10) : 1)
        } else if (res.groups && !(res.groups.element in Object.keys(elements))) {
          elements[res.groups.element] = (res.groups && res.groups.n ? parseInt(res.groups.n, 10) : 1)
        }
      })

      return elements
    }

    const formatFormula = (elements: any) => {
      let formula = ''
      Object.keys(elements).sort().forEach((elementKey: string) => {
        const element = elements[elementKey]
        if (element > 0) {
          formula += elementKey + element
        }
      })
      return formula
    }

    const calculateMzFromFormula = (molecularFormula: string) => {
      const ionFormula = generateIonFormula(molecularFormula)
      const ionElements = parseFormula(ionFormula)
      let mz = 0

      Object.keys(ionElements).forEach((elementKey: string) => {
        const nOfElements = ionElements[elementKey]
        if (periodicTable[elementKey]) {
          const mass = periodicTable[elementKey][2][0]
          mz += nOfElements * mass
        }
      })

      return mz
    }

    const generateIonFormula = (molecularFormula: string) => {
      const cleanFormula = molecularFormula.toUpperCase().trim().replace(/\s/g, '')
      const regexpFormulas = /(?<formula>\w+)(?<adducts>([+-]\w+)*)/ig
      const match = regexpFormulas.exec(cleanFormula)
      const formula = match && match.groups ? match.groups.formula : ''
      const adducts : string[] = []

      if (match && match.groups && match.groups.adducts) {
        const regexpAdduct = /([+-]\w+)/ig
        Array.from(match.groups.adducts.matchAll(regexpAdduct),
          (res, idx) => {
            adducts.push(res[0])
          })
      }

      const ionElements = parseFormula(formula)

      adducts.forEach((adduct: string) => {
        const elem = adduct.replace(/[^a-zA-Z]/g, '')
        if (adduct.indexOf('+') !== -1) {
          if (Object.keys(ionElements).includes(elem)) {
            ionElements[elem] += 1
          } else {
            ionElements[elem] = 1
          }
        } else if (adduct.indexOf('-') !== -1) {
          if (Object.keys(ionElements).includes(elem)) {
            ionElements[elem] -= 1
          }
        }
      })

      return formatFormula(ionElements)
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
        console.log('E', e)
      } finally {
        state.imageLoading = false
      }
    }

    onAnnotationsResult(async(result) => {
      if (dataset.value && result) {
        const mz = result.data.allAnnotations[0].mz
        const ppm = 3
        state.mzmScoreFilter = mz
        state.mzmPolarityFilter = ppm
        state.mzmScaleFilter = 'ppm'
        await requestIonImage()
        if (!state.imageSettings) {
          startImageLoaderSettings()
        }
        await setIonImage()
        buildMetadata(dataset.value)
        if (state.x !== undefined && state.y !== undefined) {
          await requestSpectrum(state.x, state.y)
        }
      }
      queryOptions.enabled = false
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
          <p class='font-semibold'>Browsing filters</p>
          <div class='filter-holder'>
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
                state.moleculeFilter = undefined
              }}
              onChange={() => {
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
          <div class='flex flex-row w-full items-end mt-2'>
            <span class='label'>Formula</span>
            <Input
              class='formula-input'
              value={state.moleculeFilter}
              onInput={(value: string) => {
                state.moleculeFilter = value
                state.mzmScoreFilter = undefined
              }}
              onChange={() => {
                const { moleculeFilter } : any = state
                requestIonImage(calculateMzFromFormula(moleculeFilter as string))
              }}
              size='mini'
              placeholder='H2O+H'
            />
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

    const handlePixelSelect = (coordinates: any) => {
      requestSpectrum(coordinates.x, coordinates.y)
    }

    const handleImageMove = ({ zoom, xOffset, yOffset }: any) => {
      state.imageSettings.imagePosition.zoom = zoom
      state.imageSettings.imagePosition.xOffset = xOffset
      state.imageSettings.imagePosition.yOffset = yOffset
    }

    const handleColormapChange = (colormap: string) => {
      state.imageSettings.colormap = colormap
      buildRangeSliderStyle()
    }

    const handleScaleTypeChange = (scaleType: string) => {
      state.imageSettings.scaleType = scaleType
      buildRangeSliderStyle()
    }

    const handleScaleBarColorChange = (color: string) => {
      state.imageSettings.scaleBarColor = color
    }

    const getIntensityData = (
      image: number, clipped: number, scaled: number, user: number, quantile: number, isLocked?: boolean,
    ) => {
      const isClipped = quantile > 0 && quantile < 1 && user === image
      return {
        image,
        clipped,
        scaled,
        user,
        quantile,
        status: isLocked ? 'LOCKED' : isClipped ? 'CLIPPED' : undefined,
      }
    }

    const getIntensity = (ionImage: any, lockedIntensities: any = []) => {
      if (ionImage !== null) {
        const {
          minIntensity, maxIntensity,
          clippedMinIntensity, clippedMaxIntensity,
          scaledMinIntensity, scaledMaxIntensity,
          userMinIntensity, userMaxIntensity,
          lowQuantile, highQuantile,
        } = ionImage || {}
        const [lockedMin, lockedMax] = lockedIntensities

        return {
          min: getIntensityData(
            minIntensity,
            clippedMinIntensity,
            scaledMinIntensity,
            userMinIntensity,
            lowQuantile,
            lockedMin !== undefined,
          ),
          max: getIntensityData(
            maxIntensity,
            clippedMaxIntensity,
            scaledMaxIntensity,
            userMaxIntensity,
            highQuantile,
            lockedMax !== undefined,
          ),
        }
      }
      return null
    }

    const startImageLoaderSettings = () => {
      state.imageSettings = {
        lockedIntensities: [undefined, undefined],
        annotImageOpacity: 1.0,
        opticalOpacity: 1.0,
        colormap: 'Viridis',
        scaleType: 'linear',
        opacityMode: 'constant',
        scaleBarColor: '#000000',
        imagePosition: {
          zoom: 1,
          xOffset: 0,
          yOffset: 0,
        },
        opticalSrc: null,
        opticalTransform: null,
        userScaling: [0, 1],
        imageScaledScaling: [0, 1],
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
              {renderBrowsingFilters()}
              <DatasetBrowserSpectrumChart
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
                  state.imageSettings
                  && <MainImageHeader
                    class='dataset-comparison-grid-item-header dom-to-image-hidden'
                    annotation={state.annotation}
                    slot="title"
                    hideTitle
                    isActive={false}
                    showOpticalImage={false}
                    toggleOpticalImage={(e: any) => { }}
                    resetViewport={startImageLoaderSettings}
                    hasOpticalImage={false}
                    colormap={state.imageSettings.colormap}
                    onColormapChange={handleColormapChange}
                    scaleType={state.imageSettings.scaleType}
                    onScaleTypeChange={handleScaleTypeChange}
                    onScaleBarColorChange={handleScaleBarColorChange}
                  />
                }
                {
                  state.annotation
                  && state.imageSettings
                  && <div class='relative'>
                    <MainImage
                      keepPixelSelected
                      annotation={state.annotation}
                      opacity={1}
                      hideColorBar
                      imageLoaderSettings={state.imageSettings}
                      imagePosition={state.imageSettings.imagePosition}
                      applyImageMove={handleImageMove}
                      colormap={state.imageSettings.colormap}
                      scaleBarColor={state.imageSettings.scaleBarColor}
                      scaleType={state.imageSettings.scaleType}
                      userScaling={state.imageSettings.imageScaledScaling}
                      pixelSizeX={getPixelSizeX()}
                      pixelSizeY={getPixelSizeY()}
                      {...{ on: { 'pixel-select': handlePixelSelect } }}
                    />
                    {
                      state.imageSettings.intensity
                      && <div class="ds-viewer-controls-wrapper  v-rhythm-3 sm-side-bar">
                        <FadeTransition class="absolute top-0 right-0 mt-3 ml-3 dom-to-image-hidden">
                          <div
                            class="range-slider p-3 bg-gray-100 rounded-lg box-border shadow-xs">
                            <RangeSlider
                              class="ds-comparison-opacity-item"
                              value={state.imageSettings.userScaling}
                              min={0}
                              max={1}
                              step={0.01}
                              style={state.rangeSliderStyle}
                              onInput={handleUserScalingChange}
                            />
                            <div
                              class="ds-intensities-wrapper">
                              <IonIntensity
                                intensities={state.imageSettings.intensity?.min}
                                label="Minimum intensity"
                                placeholder="min."
                                onInput={(value: number) => handleIonIntensityChange(value, 'min')}
                                onLock={(value: number) => handleIonIntensityLockChange(value, 'min')}
                              />
                              <IonIntensity
                                intensities={state.imageSettings.intensity?.max}
                                label="Maximum intensity"
                                placeholder="man."
                                onInput={(value: number) => handleIonIntensityChange(value, 'max')}
                                onLock={(value: number) => handleIonIntensityLockChange(value, 'max')}
                              />
                            </div>
                          </div>
                        </FadeTransition>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      )
    }
  },
})
