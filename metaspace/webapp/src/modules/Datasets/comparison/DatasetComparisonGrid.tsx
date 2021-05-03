import { defineComponent, onMounted, reactive, watchEffect } from '@vue/composition-api'
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

interface DatasetComparisonGridProps {
  nCols: number
  nRows: number
  settings: any
  selectedAnnotation: number
  annotations: any[]
  isLoading: boolean
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
    isLoading: {
      type: Boolean,
      default: false,
    },
  },
  // @ts-ignore
  setup: function(props, { refs, root }) {
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

    onMounted(() => {
      state.refsLoaded = true
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
      const { width = 410, height = 300 } = finalImage || {}

      return fitImageToArea({
        imageWidth: width,
        imageHeight: height / (state.gridState[key]?.pixelAspectRatio || 1),
        areaWidth: 300,
        areaHeight: 410,
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
          ? state.gridState[key].colormap : 'Viridis',
        scaleType: hasPreviousSettings && state.gridState[key].scaleType !== undefined
          ? state.gridState[key].scaleType : 'linear',
        scaleBarColor: hasPreviousSettings && state.gridState[key].scaleBarColor !== undefined
          ? state.gridState[key].scaleBarColor : '#000000',
        userScaling: hasPreviousSettings && state.gridState[key].userScaling !== undefined
          ? state.gridState[key].userScaling : [0, 1],
      }

      Vue.set(state.gridState, key, settings)
      Vue.set(state.annotationData, key, annotation)
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
        const dsIndex = selectedAnnotation.datasetIds.findIndex((dsId: string) => dsId === item)
        if (dsIndex !== -1) {
          return startImageSettings(key, selectedAnnotation.datasets[dsIndex])
        } else {
          return unsetAnnotation(key)
        }
      })

      Promise.all(settingPromises).then((values) => {
        state.firstLoaded = true
      })
    }

    watchEffect(async() => {
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
    })

    const defaultImagePosition = {
      zoom: 1,
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
      return processIonImage(png, minIntensity, maxIntensity, scaleType, userScaling)
    }

    const ionImageLayers = async(annotation: any, key: string,
      colormap: string = 'Viridis', opacityMode: any = 'linear') => {
      const finalImage = await ionImage(state.gridState[key]?.ionImagePng,
        annotation.isotopeImages[0],
        state.gridState[key]?.scaleType, state.gridState[key]?.userScaling)
      if (finalImage) {
        return [{
          ionImage: finalImage,
          colorMap: createColormap(state.gridState[key]?.colormap || colormap,
            state.gridState[key]?.opacityMode || opacityMode,
            state.gridState[key]?.annotImageOpacity || 1),
        }]
      }
      return []
    }

    const resetViewPort = (event: any, key: string) => {
      event.stopPropagation()
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

    const handleImageLayerUpdate = async(annotation: any, key: string) => {
      const ionImageLayersAux = await ionImageLayers(annotation, key)
      Vue.set(state.gridState, key, { ...state.gridState[key], ionImageLayers: ionImageLayersAux })
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

    const handleScaleBarColorChange = (scaleBarColor: string, key: string) => {
      Vue.set(state.gridState, key, { ...state.gridState[key], scaleBarColor })
    }

    const renderImageViewerHeaders = (row: number, col: number) => {
      if (
        (!props.isLoading
          && state.annotationData[`${row}-${col}`]?.empty
          && state.gridState[`${row}-${col}`]?.empty)
        || (!props.isLoading && state.selectedAnnotation === -1)
      ) {
        return (
          <div key={col} class='dataset-comparison-grid-col overflow-hidden items-center justify-center'
            style={{ height: 200, width: 200 }}>
            <span>No data</span>
          </div>)
      }

      return (
        <div key={col} class='dataset-comparison-grid-col overflow-hidden'
          style={{ height: 200, width: 200 }}>
          <MainImageHeader
            class='dataset-comparison-grid-item-header dom-to-image-hidden'
            annotation={state.annotationData[`${row}-${col}`]}
            slot="title"
            isActive={false}
            scaleBarColor={state.gridState[`${row}-${col}`]?.scaleBarColor}
            onScaleBarColorChange={(scaleBarColor: string) =>
              handleScaleBarColorChange(scaleBarColor, `${row}-${col}`)}
            scaleType={state.gridState[`${row}-${col}`]?.scaleType}
            onScaleTypeChange={(scaletype: string) =>
              handleScaleTypeChange(scaletype, `${row}-${col}`)}
            colormap={state.gridState[`${row}-${col}`]?.colormap}
            onColormapChange={(colormap: string) =>
              handleColormapChange(colormap, `${row}-${col}`)}
            showOpticalImage={!!state.gridState[`${row}-${col}`]?.showOpticalImage}
            toggleOpticalImage={(e: any) => toggleOpticalImage(e, `${row}-${col}`)}
            resetViewport={(e: any) => resetViewPort(e, `${row}-${col}`)}
            hasOpticalImage={
              state.annotationData[`${row}-${col}`]?.dataset?.opticalImages[0]?.url
              !== undefined}
          />
          <div ref={`image-${row}-${col}`} class='ds-wrapper relative'>
            {
              props.isLoading
              && <i
                class="el-icon-loading"
              />
            }
            {
              state.gridState[`${row}-${col}`]
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
                height={300}
                width={410}
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
