import { computed, defineComponent, onMounted, onUnmounted, reactive, watch } from '@vue/composition-api'
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
  colormap: string,
  scaleType: string,
  scaleBarColor: string
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
      colormap: 'Viridis',
      scaleType: 'linear',
      scaleBarColor: '#000000',
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
      const hasPreviousSettings = state.gridState[key] && !state.gridState[key].empty
      const ionImagePng = await loadPngFromUrl(annotation.isotopeImages[0].url)
      const ionImageLayersAux = await ionImageLayers(annotation, key)
      const imageFitAux = await imageFit(annotation, key)
      const intensity = getIntensity(ionImageLayersAux[0]?.ionImage)
      const metadata = getMetadata(annotation)
      const hasPreviousLockedIntensities = hasPreviousSettings && state.gridState[key].lockedIntensities
        !== undefined
        && (state.gridState[key].lockedIntensities[0] !== undefined
          || state.gridState[key].lockedIntensities[1] !== undefined)

      if (intensity) {
        intensity.min.scaled = 0
        intensity.max.scaled = intensity.max.status === 'CLIPPED'
          ? intensity.max.clipped : intensity.max.image
      }

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
        lockedIntensities: hasPreviousLockedIntensities
        && state.gridState[key].lockedIntensities !== undefined
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
          ? state.gridState[key].colormap : state.colormap,
        scaleType: hasPreviousSettings && state.gridState[key].scaleType !== undefined
          ? state.gridState[key].scaleType : 'linear',
        scaleBarColor: hasPreviousSettings && state.gridState[key].scaleBarColor !== undefined
          ? state.gridState[key].scaleBarColor : '#000000',
        userScaling: hasPreviousLockedIntensities && state.gridState[key].userScaling !== undefined
          ? state.gridState[key].userScaling : [0, 1],
        imageScaledScaling: hasPreviousLockedIntensities
        && state.gridState[key].imageScaledScaling !== undefined
          ? state.gridState[key].imageScaledScaling : [0, 1],
      }

      Vue.set(state.gridState, key, settings)
      Vue.set(state.annotationData, key, annotation)
      await handleImageLayerUpdate(state.annotationData[key], key)

      // persist ion intensity lock status
      if (hasPreviousSettings && state.gridState[key].lockedIntensities !== undefined) {
        if (state.gridState[key].lockedIntensities[0] !== undefined) {
          await handleIonIntensityLockChange(state.gridState[key].lockedIntensities[0]
            , key, 'min', false)
        }
        if (state.gridState[key].lockedIntensities[1] !== undefined) {
          await handleIonIntensityLockChange(state.gridState[key].lockedIntensities[1]
            , key, 'max', false)
        }
      }
    }

    const unsetAnnotation = (key: string) => {
      Vue.set(state.annotationData, key, { empty: true })
      Vue.set(state.gridState, key, { empty: true })
    }

    const getAnnotationData = (grid: any, annotationIdx = 0) => {
      if (!grid || !annotations.value || annotations.value.length === 0 || annotationIdx === -1) {
        state.annotationData = {}
        state.gridState = {}
        state.firstLoaded = true
        return {}
      }

      const auxGrid = grid
      const selectedAnnotation = annotations.value[annotationIdx]
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

    const settings = computed(() => {
      if (props.settings.value) {
        return safeJsonParse(props.settings.value.snapshot)
      }
      return {}
    })
    const selectedAnnotation = computed(() => props.selectedAnnotation)
    const annotations = computed(() => props.annotations)
    const resetAllViewPort = computed(() => props.resetViewPort)
    const colormap = computed(() => props.colormap)
    const scaleType = computed(() => props.scaleType)
    const scaleBarColor = computed(() => props.scaleBarColor)

    // set images and annotation related items when selected annotation changes
    watch(selectedAnnotation, (newValue) => {
      getAnnotationData(settings.value.grid, newValue)
    })

    // reset view port globally
    watch(resetAllViewPort, (newValue) => {
      if (newValue) {
        emit('resetViewPort', false)
        resetGlobalViewPort()
      }
    })

    // change colormap globally
    watch(colormap, (newValue) => {
      if (state.colormap !== newValue) {
        state.colormap = newValue
        handleGlobalColormapChange(newValue)
      }
    })

    // change scaleType globally
    watch(scaleType, (newValue) => {
      if (state.scaleType !== newValue) {
        state.scaleType = newValue
        handleGlobalScaleTypeChange(newValue)
      }
    })

    // change scaleBarColor globally
    watch(scaleBarColor, (newValue) => {
      if (state.scaleBarColor !== newValue) {
        state.scaleBarColor = newValue
        handleGlobalScaleBarColorChange(newValue)
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
        state.gridState[key]?.scaleType, state.gridState[key]?.imageScaledScaling)
      const hasOpticalImage = state.annotationData[key]?.dataset?.opticalImages[0]?.url
        !== undefined

      if (finalImage) {
        return [{
          ionImage: finalImage,
          colorMap: createColormap(state.gridState[key]?.colormap || colormap,
            hasOpticalImage && state.gridState[key]?.showOpticalImage
              ? (state.gridState[key]?.opacityMode || opacityMode) : 'constant',
            hasOpticalImage && state.gridState[key]?.showOpticalImage
              ? (state.gridState[key]?.annotImageOpacity || 1) : 1),
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

    const toggleOpticalImage = async(event: any, key: string) => {
      event.stopPropagation()
      Vue.set(state.gridState, key, {
        ...state.gridState[key],
        showOpticalImage: !state.gridState[key].showOpticalImage,
        annotImageOpacity:
          !state.gridState[key].showOpticalImage ? state.gridState[key].annotImageOpacity : 1,
      })
      await handleImageLayerUpdate(state.annotationData[key], key)
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

    const handleGlobalColormapChange = (colormap: string) => {
      Object.keys(state.gridState).forEach((key: string) => {
        handleColormapChange(colormap, key)
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
      const maxIntensity = state.gridState[key].intensity.max.status === 'CLIPPED'
        ? state.gridState[key].intensity.max.clipped : state.gridState[key].intensity.max.image
      const minScale =
        state.gridState[key].intensity?.min?.status === 'LOCKED'
          ? userScaling[0] * (1
          - (state.gridState[key].intensity.min.user / maxIntensity))
          + (state.gridState[key].intensity.min.user / maxIntensity)
          : userScaling[0]

      const maxScale = userScaling[1] * (state.gridState[key].intensity?.max?.status === 'LOCKED'
        ? state.gridState[key].intensity.max.user / maxIntensity : 1)
      const scale = [minScale, maxScale]
      const rangeSliderScale = userScaling.slice(0)

      // added in order to keep consistency even with ignore boundaries
      if (rangeSliderScale[0] < 0) {
        rangeSliderScale[0] = 0
      }
      if (rangeSliderScale[1] > 1) {
        rangeSliderScale[1] = 1
      }

      Vue.set(state.gridState, key, {
        ...state.gridState[key],
        userScaling: rangeSliderScale,
        imageScaledScaling: scale,
        intensity: {
          ...state.gridState[key].intensity,
          min:
            {
              ...state.gridState[key].intensity.min,
              scaled:
                state.gridState[key].intensity?.min?.status === 'LOCKED'
                && maxIntensity * userScaling[0]
                < state.gridState[key].intensity.min.user
                  ? state.gridState[key].intensity.min.user
                  : maxIntensity * userScaling[0],
            },
          max:
            {
              ...state.gridState[key].intensity.max,
              scaled:

                state.gridState[key].intensity?.max?.status === 'LOCKED'
                && maxIntensity * userScaling[1]
                > state.gridState[key].intensity.max.user
                  ? state.gridState[key].intensity.max.user
                  : maxIntensity * userScaling[1],
            },
        },
      })

      await handleImageLayerUpdate(state.annotationData[key], key)
    }

    const handleGlobalScaleTypeChange = (scaleType: string) => {
      Object.keys(state.gridState).forEach((key: string) => {
        handleScaleTypeChange(scaleType, key)
      })
    }

    const handleScaleTypeChange = async(scaleType: string, key: string) => {
      Vue.set(state.gridState, key, { ...state.gridState[key], scaleType })
      await handleImageLayerUpdate(state.annotationData[key], key)
    }

    const handleIonIntensityChange = async(intensity: number, key: string, type: string,
      ignoreBoundaries : boolean = false) => {
      let minScale = state.gridState[key].userScaling[0]
      let maxScale = state.gridState[key].userScaling[1]
      const maxIntensity = state.gridState[key].intensity.max.status === 'CLIPPED'
        ? state.gridState[key].intensity.max.clipped : state.gridState[key].intensity.max.image

      if (type === 'min') {
        minScale = intensity / maxIntensity
        if (!ignoreBoundaries) {
          minScale = minScale > 1 ? 1 : minScale
          minScale = minScale > maxScale ? maxScale : minScale
          minScale = minScale < 0 ? 0 : minScale
        }
      } else {
        maxScale = intensity / maxIntensity
        if (!ignoreBoundaries) {
          maxScale = maxScale > 1 ? 1 : maxScale
          maxScale = maxScale < 0 ? 0 : maxScale
          maxScale = maxScale < minScale ? minScale : maxScale
        }
      }

      handleUserScalingChange([minScale, maxScale], key)
    }

    const handleIonIntensityLockChange = async(value: number, key: string, type: string,
      applyToAll : boolean = true) => {
      const minLocked = type === 'min' ? value : state.gridState[key].lockedIntensities[0]
      const maxLocked = type === 'max' ? value : state.gridState[key].lockedIntensities[1]
      const lockedIntensities = [minLocked, maxLocked]
      const intensity = getIntensity(state.gridState[`${key}`]?.ionImageLayers[0]?.ionImage,
        lockedIntensities)

      if (intensity && intensity.max && maxLocked && intensity.max.status === 'LOCKED') {
        intensity.max.scaled = maxLocked
        intensity.max.user = maxLocked
      }

      if (intensity && intensity.min && minLocked && intensity.min.status === 'LOCKED') {
        intensity.min.scaled = minLocked
        intensity.min.user = minLocked
      }

      if (intensity && intensity.min !== undefined && intensity.min.status !== 'LOCKED'
      ) {
        intensity.min.scaled = 0
        Vue.set(state.gridState, key, {
          ...state.gridState[key],
          imageScaledScaling: [0, state.gridState[`${key}`].imageScaledScaling[1]],
        })
      }
      if (intensity && intensity.max !== undefined && intensity.max.status !== 'LOCKED') {
        intensity.max.scaled = intensity.max.status === 'CLIPPED'
          ? intensity.max.clipped : intensity.max.image
        Vue.set(state.gridState, key, {
          ...state.gridState[key],
          imageScaledScaling: [state.gridState[`${key}`].imageScaledScaling[0], 1],
        })
      }

      Vue.set(state.gridState, key, {
        ...state.gridState[key],
        lockedIntensities: lockedIntensities,
        intensity: intensity,
        userScaling: [0, 1],
      })

      // apply max lock to all grids
      if (applyToAll) {
        Object.keys(state.gridState).forEach((gridKey) => {
          if (gridKey !== key) {
            handleIonIntensityLockChange(value, gridKey, type, false)
            if (value) {
              handleIonIntensityChange(value, gridKey, type, true)
            }
          }
        })
      }

      await handleImageLayerUpdate(state.annotationData[key], key)
    }

    const handleGlobalScaleBarColorChange = (scaleBarColor: string) => {
      Object.keys(state.gridState).forEach((key: string) => {
        handleScaleBarColorChange(scaleBarColor, key)
      })
    }

    const handleScaleBarColorChange = async(scaleBarColor: string, key: string) => {
      Vue.set(state.gridState, key, { ...state.gridState[key], scaleBarColor })
    }

    const renderDatasetName = (row: number, col: number) => {
      const dataset =
        props.datasets
          ? props.datasets.find((dataset: any) => dataset.id === settings.value.grid[`${row}-${col}`])
          : null
      return (
        <span class='dataset-comparison-grid-ds-name'>{dataset?.name}</span>
      )
    }

    const renderImageViewerHeaders = (row: number, col: number) => {
      if (
        (!props.isLoading
          && state.annotationData[`${row}-${col}`]?.empty
          && state.gridState[`${row}-${col}`]?.empty)
        || (!props.isLoading && selectedAnnotation.value === -1)
        || (selectedAnnotation.value >= annotations.value.length)
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
                MSM <b>{formatMSM(state.annotationData[`${row}-${col}`].msmScore)}</b>
              </div>
              <div class="dataset-comparison-fdr-badge">
                FDR <b>{formatFDR(state.annotationData[`${row}-${col}`].fdrLevel)}</b>
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
