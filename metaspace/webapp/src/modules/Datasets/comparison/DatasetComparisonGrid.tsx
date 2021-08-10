import { defineComponent, onMounted, onUnmounted, reactive, watchEffect } from '@vue/composition-api'
import './DatasetComparisonGrid.scss'
import MainImageHeader from '../../Annotations/annotation-widgets/default/MainImageHeader.vue'
import Vue from 'vue'
import createColormap from '../../../lib/createColormap'
import { loadPngFromUrl, processIonImage, renderScaleBar } from '../../../lib/ionImageRendering'
import IonImageViewer from '../../../components/IonImageViewer'
import safeJsonParse from '../../../lib/safeJsonParse'
import fitImageToArea from '../../../lib/fitImageToArea'
import FadeTransition from '../../../components/FadeTransition'
import OpacitySettings from '../../ImageViewer/OpacitySettings.vue'
import RangeSlider from '../../../components/Slider/RangeSlider.vue'
import IonIntensity from '../../ImageViewer/IonIntensity.vue'
import ImageSaver from '../../ImageViewer/ImageSaver.vue'
import getColorScale from '../../../lib/getColorScale'
import { THUMB_WIDTH } from '../../../components/Slider'
import { isEqual } from 'lodash-es'
import { encodeParams } from '../../Filters'
import StatefulIcon from '../../../components/StatefulIcon.vue'
import { ExternalWindowSvg } from '../../../design/refactoringUIIcons'
import { Popover } from '../../../lib/element-ui'

const RouterLink = Vue.component('router-link')

interface DatasetComparisonGridProps {
  nCols: number
  nRows: number
  settings: any
  colormap: string
  scaleType: string
  scaleBarColor: string
  selectedAnnotation: number
  annotations: any[]
  datasets: any[]
  isLoading: boolean
  resetViewPort: boolean
}

interface DatasetComparisonGridState {
  gridState: any,
  grid: any,
  annotationData: any,
  annotations: any[],
  refsLoaded: boolean,
  showViewer: boolean,
  annotationLoading: boolean,
  firstLoaded: boolean,
  filter: any
  selectedAnnotation: number
}

export const DatasetComparisonGrid = defineComponent<DatasetComparisonGridProps>({
  name: 'DatasetComparisonGrid',
  props: {
    nCols: {
      type: Number,
      required: true,
      default: 2,
    },
    nRows: {
      type: Number,
      required: true,
      default: 2,
    },
    settings: {
      type: Object,
      required: true,
    },
    selectedAnnotation: {
      type: Number,
    },
    annotations: {
      type: Array,
      required: true,
    },
    datasets: {
      type: Array,
      required: true,
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
    resetViewPort: {
      type: Boolean,
      default: false,
    },
    colormap: {
      type: String,
      default: 'Viridis',
    },
    scaleType: {
      type: String,
      default: 'linear',
    },
    scaleBarColor: {
      type: String,
      default: '#000000',
    },
  },
  // @ts-ignore
  setup: function(props, { refs, emit, root }) {
    const { $route, $store } = root

    const state = reactive<DatasetComparisonGridState>({
      gridState: {},
      grid: undefined,
      annotations: [],
      annotationData: {},
      selectedAnnotation: props.selectedAnnotation,
      refsLoaded: false,
      showViewer: false,
      annotationLoading: true,
      firstLoaded: false,
      filter: $store?.getters?.filter,
    })

    const dimensions = reactive({
      width: 410,
      height: 300,
    })

    const resizeHandler = () => {
      let width = 0
      let height = 0
      Object.keys(refs).filter((key: string) => key.includes('image')).forEach((key: string) => {
        const container = refs[key]
        if (container && container.clientWidth > width) {
          width = container.clientWidth
        }
        if (container && container.clientHeight > height) {
          height = container.clientHeight
        }
      })
      if (width !== 0 && height !== 0) {
        dimensions.width = width
        dimensions.height = height
      }
    }

    onMounted(() => {
      state.refsLoaded = true
      window.addEventListener('resize', resizeHandler)
    })

    onUnmounted(() => {
      window.removeEventListener('resize', resizeHandler)
    })

    const getMetadata = (annotation: any) => {
      const datasetMetadataExternals = {
        Submitter: annotation.dataset.submitter,
        PI: annotation.dataset.principalInvestigator,
        Group: annotation.dataset.group,
        Projects: annotation.dataset.projects,
      }
      return Object.assign(safeJsonParse(annotation.dataset.metadataJson), datasetMetadataExternals)
    }

    const imageFit = async(annotation: any, key: string, pixelAspectRatio: number = 1) => {
      const finalImage = await ionImage(state.gridState[key]?.ionImagePng, annotation.isotopeImages[0])
      const { width = dimensions.width, height = dimensions.height } = finalImage || {}

      return fitImageToArea({
        imageWidth: width,
        imageHeight: height / (state.gridState[key]?.pixelAspectRatio || 1),
        areaWidth: dimensions.height,
        areaHeight: dimensions.width,
      })
    }

    const buildRangeSliderStyle = (key: string, scaleRange: number[] = [0, 1]) => {
      if (!refs[`range-slider-${key}`] || state.gridState[`${key}`]?.empty || !state.gridState[`${key}`]) {
        return null
      }

      const width = refs[`range-slider-${key}`]?.offsetWidth
      const activeColorMap = state.gridState[`${key}`]?.colormap
      const ionImage = state.gridState[`${key}`]?.ionImageLayers[0]?.ionImage
      const cmap = createColormap(activeColorMap)
      const { range } = getColorScale(activeColorMap)
      const { scaledMinIntensity, scaledMaxIntensity } = ionImage || {}
      const minColor = range[0]
      const maxColor = range[range.length - 1]
      const gradient = scaledMinIntensity === scaledMaxIntensity
        ? `linear-gradient(to right, ${range.join(',')})`
        : ionImage ? `url(${renderScaleBar(ionImage, cmap, true)})` : ''
      const [minScale, maxScale] = scaleRange
      const minStop = Math.ceil(THUMB_WIDTH + ((width - THUMB_WIDTH * 2) * minScale))
      const maxStop = Math.ceil(THUMB_WIDTH + ((width - THUMB_WIDTH * 2) * maxScale))
      return {
        background: [
          `0px / ${minStop}px 100% linear-gradient(${minColor},${minColor}) no-repeat`,
          `${minStop}px / ${maxStop - minStop}px 100% ${gradient} repeat-y`,
          `${minColor} ${maxStop}px / ${width - maxStop}px 100% linear-gradient(${maxColor},${maxColor}) no-repeat`,
        ].join(','),
      }
    }

    const startImageSettings = async(key: string, annotation: any) => {
      const ionImagePng = await loadPngFromUrl(annotation.isotopeImages[0].url)
      const ionImageLayersAux = await ionImageLayers(annotation, key)
      const imageFitAux = await imageFit(annotation, key)
      const intensity = getIntensity(ionImageLayersAux[0]?.ionImage)
      const metadata = getMetadata(annotation)
      const hasPreviousSettings = state.gridState[key] && !state.gridState[key].empty

      const settings = {
        intensity,
        ionImagePng,
        metadata,
        // eslint-disable-next-line camelcase
        pixelSizeX: metadata?.MS_Analysis?.Pixel_Size?.Xaxis || 0,
        // eslint-disable-next-line camelcase
        pixelSizeY: metadata?.MS_Analysis?.Pixel_Size?.Yaxis || 0,
        ionImageLayers: ionImageLayersAux,
        imageFit: imageFitAux,
        lockedIntensities: hasPreviousSettings && state.gridState[key].lockedIntensities !== undefined
          ? state.gridState[key].lockedIntensities : [undefined, undefined],
        annotImageOpacity: hasPreviousSettings && state.gridState[key].annotImageOpacity !== undefined
          ? state.gridState[key].annotImageOpacity : 1.0,
        opacityMode: hasPreviousSettings && state.gridState[key].opacityMode !== undefined
          ? state.gridState[key].opacityMode : 'linear',
        imagePosition: hasPreviousSettings && state.gridState[key].imagePosition !== undefined
          ? state.gridState[key].imagePosition : defaultImagePosition,
        pixelAspectRatio: hasPreviousSettings && state.gridState[key].pixelAspectRatio !== undefined
          ? state.gridState[key].pixelAspectRatio : 1,
        imageZoom: hasPreviousSettings && state.gridState[key].imageZoom !== undefined
          ? state.gridState[key].imageZoom : 1,
        showOpticalImage: hasPreviousSettings && state.gridState[key].showOpticalImage !== undefined
          ? state.gridState[key].showOpticalImage : true,
        colormap: hasPreviousSettings && state.gridState[key].colormap !== undefined
          ? state.gridState[key].colormap : props.colormap,
        scaleType: hasPreviousSettings && state.gridState[key].scaleType !== undefined
          ? state.gridState[key].scaleType : 'linear',
        scaleBarColor: hasPreviousSettings && state.gridState[key].scaleBarColor !== undefined
          ? state.gridState[key].scaleBarColor : '#000000',
        userScaling: hasPreviousSettings && state.gridState[key].userScaling !== undefined
          ? state.gridState[key].userScaling : [0, 1],
      }

      Vue.set(state.gridState, key, settings)
      Vue.set(state.annotationData, key, annotation)
      await handleImageLayerUpdate(state.annotationData[key], key)
    }

    const unsetAnnotation = (key: string) => {
      Vue.set(state.annotationData, key, { empty: true })
      Vue.set(state.gridState, key, { empty: true })
    }

    const getAnnotationData = (grid: any, annotationIdx = 0) => {
      if (!grid || !props.annotations || props.annotations.length === 0 || annotationIdx === -1) {
        state.annotationData = {}
        state.gridState = {}
        state.firstLoaded = true
        return {}
      }

      const auxGrid = grid
      const selectedAnnotation = props.annotations[annotationIdx]
      const settingPromises = Object.keys(auxGrid).map(async(key) => {
        const item = auxGrid[key]
        const dsIndex = selectedAnnotation
          ? selectedAnnotation.datasetIds.findIndex((dsId: string) => dsId === item) : -1
        if (dsIndex !== -1) {
          return startImageSettings(key, selectedAnnotation.annotations[dsIndex])
        } else {
          return unsetAnnotation(key)
        }
      })

      Promise.all(settingPromises)
        .then((values) => {
          // pass
        })
        .catch((e) => {
          // pass
        })
        .finally(() => {
          state.firstLoaded = true
          resizeHandler()
        })
    }

    watchEffect(async(onInvalidate) => {
      // initial settings build
      if ((!state.grid && props.annotations && props.settings.value)
        || (state.grid && !isEqual(state.annotations, props.annotations))) {
        const auxSettings = safeJsonParse(props.settings.value.snapshot)
        state.grid = auxSettings.grid
        state.annotations = props.annotations
        await getAnnotationData(state.grid, state.selectedAnnotation)
      } else if (state.selectedAnnotation !== props.selectedAnnotation) { // row change update
        state.selectedAnnotation = props.selectedAnnotation
        await getAnnotationData(state.grid, state.selectedAnnotation)
      }

      // reset global viewPort
      if (props.resetViewPort === true && state.gridState) {
        emit('resetViewPort', false)
        resetGlobalViewPort()
      }

      // change global colormap
      if (props.colormap && state.gridState) {
        let diffColormapCount = 0
        Object.keys(state.gridState).forEach((key: string) => {
          if (state.gridState[key] && state.gridState[key].colormap
            && state.gridState[key].colormap !== props.colormap) {
            diffColormapCount += 1
          }
        })

        if (diffColormapCount > 0) {
          handleGlobalColormapChange()
        }
      }

      // change global scaleType
      if (props.scaleType && state.gridState) {
        let diffScaleCount = 0
        Object.keys(state.gridState).forEach((key: string) => {
          if (state.gridState[key] && state.gridState[key].scaleType
            && state.gridState[key].scaleType !== props.scaleType) {
            diffScaleCount += 1
          }
        })

        if (diffScaleCount > 0) {
          handleGlobalScaleTypeChange()
        }
      }

      // change global scaleBarColor
      if ((props.scaleBarColor || props.scaleBarColor === null) && state.gridState) {
        let diffscaleBarColorCount = 0
        Object.keys(state.gridState).forEach((key: string) => {
          if (state.gridState[key]
            && (state.gridState[key].scaleBarColor || state.gridState[key].scaleBarColor === null)
            && state.gridState[key].scaleBarColor !== props.scaleBarColor) {
            diffscaleBarColorCount += 1
          }
        })

        if (diffscaleBarColorCount > 0) {
          handleGlobalScaleBarColorChange()
        }
      }
    })

    const defaultImagePosition = {
      zoom: 0.7,
      xOffset: 0,
      yOffset: 0,
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

    const ionImage = async(ionImagePng: any, isotopeImage: any,
      scaleType: any = 'linear', userScaling: any = [0, 1]) => {
      if (!isotopeImage) {
        return null
      }
      const { minIntensity, maxIntensity } = isotopeImage
      const png = await loadPngFromUrl(isotopeImage.url)
      return png
        ? processIonImage(png, minIntensity, maxIntensity, scaleType, userScaling) : null
    }

    const ionImageLayers = async(annotation: any, key: string,
      colormap: string = 'Viridis', opacityMode: any = 'linear') => {
      const finalImage = await ionImage(state.gridState[key]?.ionImagePng,
        annotation.isotopeImages[0],
        state.gridState[key]?.scaleType, state.gridState[key]?.userScaling)
      const hasOpticalImage = state.annotationData[key]?.dataset?.opticalImages[0]?.url
        !== undefined

      if (finalImage) {
        return [{
          ionImage: finalImage,
          colorMap: createColormap(state.gridState[key]?.colormap || colormap,
            hasOpticalImage ? (state.gridState[key]?.opacityMode || opacityMode) : 'constant',
            hasOpticalImage ? (state.gridState[key]?.annotImageOpacity || 1) : 1),
        }]
      }
      return []
    }

    const resetGlobalViewPort = () => {
      Object.keys(state.gridState).forEach((key: string) => {
        resetViewPort(null, key)
      })
    }

    const resetViewPort = (event: any, key: string) => {
      if (event) {
        event.stopPropagation()
      }
      Vue.set(state.gridState, key, { ...state.gridState[key], imagePosition: defaultImagePosition })
    }

    const toggleOpticalImage = (event: any, key: string) => {
      event.stopPropagation()
      Vue.set(state.gridState, key, {
        ...state.gridState[key],
        showOpticalImage: !state.gridState[key].showOpticalImage,
        annotImageOpacity:
          !state.gridState[key].showOpticalImage ? state.gridState[key].annotImageOpacity : 1,
      })
    }
    const formatMSM = (value: number) => {
      return value.toFixed(3)
    }

    const formatFDR = (value: number) => {
      return value ? `${Math.round(value * 100)}%` : '-'
    }

    const handleImageMove = ({ zoom, xOffset, yOffset }: any, imageFit: any, key: string) => {
      Vue.set(state.gridState, key, {
        ...state.gridState[key],
        imagePosition: {
          ...state.gridState[key].imagePosition,
          zoom: zoom / imageFit.imageZoom,
          xOffset,
          yOffset,
        },
      })
    }

    const annotationsLink = (datasetId: string, database?: string, fdrLevel?: number) => {
      const query = {
        database,
        fdrLevel,
        datasetIds: [datasetId],
      }
      // delete undefined so that filter do not replace the nulls and make the navigation back weird
      if (!database) {
        delete query.database
      }
      if (!fdrLevel) {
        delete query.fdrLevel
      }

      return {
        name: 'annotations',
        params: { dataset_id: datasetId },
        query: encodeParams(query),
      }
    }

    const handleImageLayerUpdate = async(annotation: any, key: string) => {
      const ionImageLayersAux = await ionImageLayers(annotation, key)
      Vue.set(state.gridState, key, { ...state.gridState[key], ionImageLayers: ionImageLayersAux })
    }

    const handleGlobalColormapChange = () => {
      Object.keys(state.gridState).forEach((key: string) => {
        handleColormapChange(props.colormap, key)
      })
    }

    const handleColormapChange = async(colormap: string, key: string) => {
      Vue.set(state.gridState, key, { ...state.gridState[key], colormap })
      await handleImageLayerUpdate(state.annotationData[key], key)
    }

    const handleOpacityChange = async(opacity: any, key: string) => {
      Vue.set(state.gridState, key, { ...state.gridState[key], annotImageOpacity: opacity })
      await handleImageLayerUpdate(state.annotationData[key], key)
    }

    const handleUserScalingChange = async(userScaling: any, key: string) => {
      Vue.set(state.gridState, key, { ...state.gridState[key], userScaling: userScaling })
      await handleImageLayerUpdate(state.annotationData[key], key)
    }

    const handleGlobalScaleTypeChange = () => {
      Object.keys(state.gridState).forEach((key: string) => {
        handleScaleTypeChange(props.scaleType, key)
      })
    }

    const handleScaleTypeChange = async(scaleType: string, key: string) => {
      Vue.set(state.gridState, key, { ...state.gridState[key], scaleType })
      await handleImageLayerUpdate(state.annotationData[key], key)
    }

    const handleIonIntensityChange = async(intensity: number, key: string, type: string) => {
      if (type === 'min') {
        Vue.set(state.gridState, key, { ...state.gridState[key], minIntensity: intensity })
      } else {
        Vue.set(state.gridState, key, { ...state.gridState[key], maxIntensity: intensity })
      }
    }

    const handleIonIntensityLockChange = async(value: number, key: string, type: string) => {
      const minLocked = type === 'min' ? value : state.gridState[key].lockedIntensities[0]
      const maxLocked = type === 'max' ? value : state.gridState[key].lockedIntensities[1]
      const lockedIntensities = [minLocked, maxLocked]
      const intensity = getIntensity(state.gridState[`${key}`]?.ionImageLayers[0]?.ionImage,
        lockedIntensities)

      Vue.set(state.gridState, key, { ...state.gridState[key], lockedIntensities, intensity })
    }

    const handleGlobalScaleBarColorChange = () => {
      Object.keys(state.gridState).forEach((key: string) => {
        handleScaleBarColorChange(props.scaleBarColor, key)
      })
    }

    const handleScaleBarColorChange = async(scaleBarColor: string, key: string) => {
      Vue.set(state.gridState, key, { ...state.gridState[key], scaleBarColor })
    }

    const renderDatasetName = (row: number, col: number) => {
      const dataset =
        props.datasets
          ? props.datasets.find((dataset: any) => dataset.id === state.grid[`${row}-${col}`])
          : null
      return (
        <div class='dataset-comparison-grid-ds-name'>
          <span class='ds-name'>
            {dataset?.name}
          </span>
        </div>
      )
    }

    const renderImageViewerHeaders = (row: number, col: number) => {
      if (
        (!props.isLoading
          && state.annotationData[`${row}-${col}`]?.empty
          && state.gridState[`${row}-${col}`]?.empty)
        || (!props.isLoading && state.selectedAnnotation === -1)
      ) {
        return (
          <div key={col} class='dataset-comparison-grid-col overflow-hidden items-center justify-start'
            style={{ height: 200, width: 200 }}>
            {renderDatasetName(row, col)}
            <span>No data</span>
          </div>)
      }

      return (
        <div key={col} class='dataset-comparison-grid-col overflow-hidden relative'
          style={{ height: 200, width: 200 }}>
          {
            state.gridState
            && state.gridState[`${row}-${col}`]
            && renderDatasetName(row, col)
          }
          <MainImageHeader
            class='dataset-comparison-grid-item-header dom-to-image-hidden'
            annotation={state.annotationData[`${row}-${col}`]}
            slot="title"
            isActive={false}
            hideOptions={true}
            showOpticalImage={!!state.gridState[`${row}-${col}`]?.showOpticalImage}
            toggleOpticalImage={(e: any) => toggleOpticalImage(e, `${row}-${col}`)}
            resetViewport={(e: any) => resetViewPort(e, `${row}-${col}`)}
            hasOpticalImage={
              state.annotationData[`${row}-${col}`]?.dataset?.opticalImages[0]?.url
              !== undefined}
          />
          {
            state.annotationData[`${row}-${col}`]
            && state.annotationData[`${row}-${col}`].msmScore
            && <div class="dataset-comparison-extra dom-to-image-hidden">
              <div class="dataset-comparison-msm-badge">
                <b>MSM</b> {formatMSM(state.annotationData[`${row}-${col}`].msmScore)}
              </div>
              <div class="dataset-comparison-fdr-badge">
                <b>FDR</b> {formatFDR(state.annotationData[`${row}-${col}`].fdrLevel)}
              </div>
              <Popover
                trigger="hover"
                placement="right"
              >
                <div slot="reference" class="dataset-comparison-link">
                  <RouterLink
                    target='_blank'
                    to={annotationsLink(state.annotationData[`${row}-${col}`].dataset.id.toString(),
                      state.annotationData[`${row}-${col}`].databaseDetails.id.toString(),
                      state.annotationData[`${row}-${col}`].databaseDetails.fdrLevel)}>

                    <StatefulIcon className="h-6 w-6 pointer-events-none">
                      <ExternalWindowSvg/>
                    </StatefulIcon>
                  </RouterLink>
                </div>
                Individual dataset annotation page.
              </Popover>
            </div>
          }
          <div ref={`image-${row}-${col}`} class='ds-wrapper relative'>
            {
              props.isLoading
              && <div class='absolute'>
                <i
                  class="el-icon-loading"
                />
              </div>
            }
            {
              !props.isLoading
              && state.gridState[`${row}-${col}`]
              && state.gridState[`${row}-${col}`].ionImageLayers
              && <IonImageViewer
                isLoading={props.isLoading || !state.firstLoaded}
                ionImageLayers={state.gridState[`${row}-${col}`]?.ionImageLayers}
                scaleBarColor={state.gridState[`${row}-${col}`]?.scaleBarColor}
                scaleType={state.gridState[`${row}-${col}`]?.scaleType}
                pixelSizeX={state.gridState[`${row}-${col}`]?.pixelSizeX}
                pixelSizeY={state.gridState[`${row}-${col}`]?.pixelSizeY}
                imageHeight={state.gridState[`${row}-${col}`]?.
                  ionImageLayers[0]?.ionImage?.height }
                imageWidth={state.gridState[`${row}-${col}`]?.
                  ionImageLayers[0]?.ionImage?.width }
                height={dimensions.height}
                width={dimensions.width}
                zoom={state.gridState[`${row}-${col}`]?.imagePosition?.zoom
                * state.gridState[`${row}-${col}`]?.imageFit?.imageZoom}
                minZoom={state.gridState[`${row}-${col}`]?.imageFit?.imageZoom / 4}
                maxZoom={state.gridState[`${row}-${col}`]?.imageFit?.imageZoom * 20}
                xOffset={state.gridState[`${row}-${col}`]?.imagePosition?.xOffset || 0}
                yOffset={state.gridState[`${row}-${col}`]?.imagePosition?.yOffset || 0}
                opticalSrc={state.gridState[`${row}-${col}`]?.showOpticalImage
                  ? state.annotationData[`${row}-${col}`]?.dataset?.opticalImages[0]?.url
                  : undefined}
                opticalTransform={state.gridState[`${row}-${col}`]?.showOpticalImage
                  ? state.annotationData[`${row}-${col}`]?.dataset?.opticalImages[0]?.transform
                  : undefined}
                scrollBlock
                showPixelIntensity
                onMove={(e: any) =>
                  handleImageMove(e, state.gridState[`${row}-${col}`]?.imageFit,
                    `${row}-${col}`)}
              />
            }
            <div class="ds-viewer-controls-wrapper  v-rhythm-3 sm-side-bar">
              <FadeTransition class="absolute bottom-0 right-0 mt-3 ml-3 dom-to-image-hidden">
                {
                  state.gridState[`${row}-${col}`]?.showOpticalImage
                  && state.annotationData[`${row}-${col}`]?.dataset?.opticalImages[0]?.url
                  !== undefined
                  && <OpacitySettings
                    key="opacity"
                    class="ds-comparison-opacity-item sm-leading-trim mt-auto dom-to-image-hidden"
                    opacity={state.gridState[`${row}-${col}`]?.annotImageOpacity !== undefined
                      ? state.gridState[`${row}-${col}`]?.annotImageOpacity : 1}
                    onOpacity={(opacity: number) => handleOpacityChange(opacity, `${row}-${col}`)}
                  />
                }
              </FadeTransition>
              <FadeTransition class="absolute top-0 right-0 mt-3 ml-3 dom-to-image-hidden">
                {
                  state.refsLoaded
                  && state.gridState[`${row}-${col}`]
                  && state.gridState[`${row}-${col}`].userScaling
                  && <div
                    class="p-3 bg-gray-100 rounded-lg box-border shadow-xs"
                    ref={`range-slider-${row}-${col}`}>
                    <RangeSlider
                      class="ds-comparison-opacity-item"
                      value={state.gridState[`${row}-${col}`].userScaling}
                      min={0}
                      max={1}
                      step={0.01}
                      style={buildRangeSliderStyle(`${row}-${col}`)}
                      onInput={(nextRange: number[]) =>
                        handleUserScalingChange(nextRange, `${row}-${col}`)}
                    />
                    <div
                      class="ds-intensities-wrapper">
                      <IonIntensity
                        value={state.gridState[`${row}-${col}`].minIntensity}
                        intensities={state.gridState[`${row}-${col}`].intensity?.min}
                        label="Minimum intensity"
                        placeholder="min."
                        onInput={(value: number) =>
                          handleIonIntensityChange(value, `${row}-${col}`,
                            'min')}
                        onLock={(value: number) =>
                          handleIonIntensityLockChange(value, `${row}-${col}`,
                            'min')}
                      />
                      <IonIntensity
                        value={state.gridState[`${row}-${col}`].maxIntensity}
                        intensities={state.gridState[`${row}-${col}`]?.intensity?.max}
                        label="Minimum intensity"
                        placeholder="min."
                        onInput={(value: number) =>
                          handleIonIntensityChange(value, `${row}-${col}`,
                            'max')}
                        onLock={(value: number) =>
                          handleIonIntensityLockChange(value, `${row}-${col}`,
                            'max')}
                      />
                    </div>
                  </div>
                }
              </FadeTransition>
            </div>
            {
              state.refsLoaded
              && <ImageSaver
                class="absolute top-0 left-0 mt-3 ml-3 dom-to-image-hidden"
                domNode={refs[`image-${row}-${col}`]}
              />
            }
          </div>
        </div>
      )
    }

    return () => {
      return (
        <div class="dataset-comparison-grid">
          {
            Array.from(Array(props.nRows).keys()).map((row) => {
              return (
                <div key={row} class='dataset-comparison-grid-row'>
                  {
                    Array.from(Array(props.nCols).keys()).map((col) => {
                      return renderImageViewerHeaders(row, col)
                    })
                  }
                </div>
              )
            })
          }
        </div>
      )
    }
  },
})
