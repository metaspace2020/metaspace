import { computed, defineComponent, onMounted, onUnmounted, reactive, watch } from '@vue/composition-api'
import './DatasetComparisonGrid.scss'
import MainImageHeader from '../../Annotations/annotation-widgets/default/MainImageHeader.vue'
import Vue from 'vue'
import createColormap from '../../../lib/createColormap'
import { IonImage, loadPngFromUrl, processIonImage, renderScaleBar } from '../../../lib/ionImageRendering'
import safeJsonParse from '../../../lib/safeJsonParse'
import fitImageToArea, { FitImageToAreaResult } from '../../../lib/fitImageToArea'
import getColorScale from '../../../lib/getColorScale'
import { THUMB_WIDTH } from '../../../components/Slider'
import { encodeParams } from '../../Filters'
import StatefulIcon from '../../../components/StatefulIcon.vue'
import { ExternalWindowSvg } from '../../../design/refactoringUIIcons'
import { Popover } from '../../../lib/element-ui'
import { ImagePosition } from '../../ImageViewer/ionImageState'
import { range } from 'lodash-es'
import config from '../../../lib/config'
import { SimpleIonImageViewer } from './components/SimpleIonImageViewer'

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
  normalizationData: any
  datasets: any[]
  isLoading: boolean
  resetViewPort: boolean
  isNormalized: boolean
  lockedIntensityTemplate: string
  globalLockedIntensities: [number | undefined, number | undefined]
  mode: string
}

interface GridCellState {
  intensity: any
  ionImagePng: any
  pixelSizeX: number
  pixelSizeY: number
  ionImageLayers: any
  imageFit: Readonly<FitImageToAreaResult>
  lockedIntensities: [number | undefined, number | undefined]
  annotImageOpacity: number
  opticalOpacity: number
  imagePosition: ImagePosition,
  pixelAspectRatio: number
  imageZoom: number
  showOpticalImage: boolean
  userScaling: [number, number],
  imageScaledScaling: [number, number],
  scaleBarUrl: Readonly<string>,
}

interface DatasetComparisonGridState {
  gridState: Record<string, GridCellState | null>,
  grid: any,
  annotationData: any,
  menuItems: any,
  annotations: any[],
  refsLoaded: boolean,
  showViewer: boolean,
  annotationLoading: boolean,
  firstLoaded: boolean,
  filter: any
  selectedAnnotation: number
}

const channels: any = {
  magenta: 'rgb(255, 0, 255)',
  green: 'rgb(0, 255, 0)',
  blue: 'rgb(0, 0, 255)',
  red: 'rgb(255, 0, 0)',
  yellow: 'rgb(255, 255, 0)',
  cyan: 'rgb(0, 255, 255)',
  orange: 'rgb(255, 128, 0)',
  violet: 'rgb(128, 0, 255)',
  white: 'rgb(255, 255, 255)',
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
    normalizationData: {
      type: Object,
      default: () => {},
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
    isNormalized: {
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
    lockedIntensityTemplate: {
      type: String,
    },
    mode: {
      type: String,
      default: 'SINGLE',
    },
    globalLockedIntensities: {
      type: Array,
      default: () => [undefined, undefined],
    },
  },
  // @ts-ignore
  setup: function(props, { refs, emit, root }) {
    const { $store } = root

    const state = reactive<DatasetComparisonGridState>({
      gridState: {},
      grid: undefined,
      annotations: [],
      annotationData: {},
      menuItems: {},
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

    const imageFit = (key: string) => {
      const gridCell = state.gridState[key]
      const { width = dimensions.width, height = dimensions.height } = gridCell?.ionImagePng || {}

      return fitImageToArea({
        imageWidth: width,
        imageHeight: height / (gridCell?.pixelAspectRatio || 1),
        areaWidth: dimensions.width,
        areaHeight: dimensions.height,
      })
    }

    const buildRangeSliderStyle = (key: string, scaleRange: number[] = [0, 1]) => {
      const gridCell = state.gridState[key]
      if (!refs[`range-slider-${key}`] || !gridCell) {
        return null
      }

      const width = refs[`range-slider-${key}`]?.offsetWidth
      const ionImage = gridCell?.ionImageLayers[0]?.ionImage
      const { range } = getColorScale(props.colormap)
      const { scaledMinIntensity, scaledMaxIntensity } = ionImage || {}
      const minColor = range[0]
      const maxColor = range[range.length - 1]
      const gradient = scaledMinIntensity === scaledMaxIntensity
        ? `linear-gradient(to right, ${range.join(',')})`
        : ionImage ? `url(${gridCell?.scaleBarUrl})` : ''
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
      const hasPreviousSettings = state.gridState[key] != null
      const ionImagePng = await loadPngFromUrl(annotation.isotopeImages[0].url)
      let gridCell: GridCellState

      if (hasPreviousSettings) {
        gridCell = state.gridState[key]!
        gridCell.ionImagePng = ionImagePng
      } else {
        const metadata = getMetadata(annotation)
        // eslint-disable-next-line camelcase
        const pixelSizeX = metadata?.MS_Analysis?.Pixel_Size?.Xaxis || 0
        // eslint-disable-next-line camelcase
        const pixelSizeY = metadata?.MS_Analysis?.Pixel_Size?.Yaxis || 0
        gridCell = reactive({
          intensity: null, // @ts-ignore // Gets set later, because ionImageLayers needs state.gridState[key] set
          ionImagePng,
          pixelSizeX,
          pixelSizeY,
          // ionImageLayers and imageFit rely on state.gridState[key] to be correctly set - avoid evaluating them
          // until this has been inserted into state.gridState
          ionImageLayers: computed(() => ionImageLayers(key)),
          imageFit: computed(() => imageFit(key)),
          lockedIntensities: [undefined, undefined],
          annotImageOpacity: 1.0,
          opticalOpacity: 1.0,
          imagePosition: defaultImagePosition(),
          pixelAspectRatio:
            config.features.ignore_pixel_aspect_ratio ? 1
              : pixelSizeX && pixelSizeY && pixelSizeX / pixelSizeY || 1,
          imageZoom: 1,
          showOpticalImage: true,
          userScaling: [0, 1],
          imageScaledScaling: [0, 1],
          scaleBarUrl: computed(() => renderScaleBar(
            gridCell.ionImageLayers[0]?.ionImage,
            createColormap(props.colormap),
            true,
          )),
        })
        Vue.set(state.gridState, key, gridCell)
        Vue.set(state.menuItems, key, [
          {
            annotation: annotation,
            colorBar: buildRangeSliderStyle(key),
            id: annotation?.dataset?.id,
            ionImage: gridCell?.ionImageLayers[0]?.ionImage,
            scaleBarUrl: gridCell?.scaleBarUrl,
            intensity: gridCell?.intensity,
            userScaling: gridCell?.userScaling,
            loading: props.isLoading,
            scaleRange: gridCell?.userScaling,
            settings: {
              channel: 'green',
              label: 'none',
              visible: true,
            },
            state: {
              maxIntensity: gridCell?.intensity?.max?.scaled,
              minIntensity: gridCell?.intensity?.min?.scaled,
              popover: null,
              scaleRange: gridCell?.userScaling,
            },
          },
        ])
      }

      const intensity = getIntensity(gridCell.ionImageLayers[0]?.ionImage)

      intensity.min.scaled = 0
      intensity.max.scaled = globalLockedIntensities.value && globalLockedIntensities.value[1]
        ? globalLockedIntensities.value[1] : (intensity.max.clipped || intensity.max.image)
      gridCell.intensity = intensity
      gridCell.lockedIntensities = globalLockedIntensities.value as [number | undefined, number | undefined]

      // persist ion intensity lock status
      if (gridCell.lockedIntensities !== undefined) {
        if (gridCell.lockedIntensities[0] !== undefined) {
          await handleIonIntensityLockChange(gridCell.lockedIntensities[0], key, 'min')
          await handleIonIntensityChange(gridCell.lockedIntensities[0], key, 'min')
        }
        if (gridCell.lockedIntensities[1] !== undefined) {
          await handleIonIntensityLockChange(gridCell.lockedIntensities[1], key, 'max')
          await handleIonIntensityChange(gridCell.lockedIntensities[1], key, 'max')
        }
      }
    }

    const updateAnnotationData = (grid: any, annotationIdx = 0) => {
      if (!grid || !props.annotations || props.annotations.length === 0 || annotationIdx === -1) {
        state.annotationData = {}
        state.gridState = {}
        state.menuItems = {}
        state.firstLoaded = true
        return
      }

      const auxGrid = grid
      const selectedAnnotation = props.annotations[annotationIdx]
      const settingPromises = Object.keys(auxGrid).map((key) => {
        const item = auxGrid[key]
        const dsIndex = selectedAnnotation
          ? selectedAnnotation.datasetIds.findIndex((dsId: string) => dsId === item) : -1
        if (dsIndex !== -1) {
          Vue.set(state.annotationData, key, selectedAnnotation.annotations[dsIndex])
          return startImageSettings(key, selectedAnnotation.annotations[dsIndex])
        } else {
          Vue.set(state.annotationData, key, null)
          Vue.set(state.gridState, key, null)
          Vue.set(state.menuItems, key, null)
        }
      })

      Promise.all(settingPromises)
        .catch(console.error)
        .finally(() => {
          if (props.lockedIntensityTemplate) {
            handleIonIntensityLockAllByTemplate(props.lockedIntensityTemplate)
          }
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

    const globalLockedIntensities = computed(() => props.globalLockedIntensities)

    // set images and annotation related items when selected annotation changes
    watch(() => props.selectedAnnotation, async(newValue) => {
      await updateAnnotationData(settings.value.grid, newValue)
    })

    const handleIonIntensityUnLockAll = () => {
      // apply max lock to all grids
      Object.keys(state.gridState).forEach((gridKey) => {
        const gridCell : GridCellState = state.gridState[gridKey]!
        if (gridCell) {
          const maxIntensity = gridCell.intensity.max.clipped || gridCell.intensity.max.image
          const minIntensity = 0
          handleIonIntensityLockChange(undefined, gridKey, 'min')
          handleIonIntensityLockChange(undefined, gridKey, 'max')
          handleIonIntensityChange(minIntensity, gridKey, 'min')
          handleIonIntensityChange(maxIntensity, gridKey, 'max')
        }
      })
    }

    // set lock by template
    watch(() => props.lockedIntensityTemplate, (newValue) => {
      if (newValue) {
        handleIonIntensityLockAllByTemplate(newValue)
      } else if (newValue === undefined) {
        handleIonIntensityUnLockAll()
      }
    })

    // reset view port globally
    watch(() => props.resetViewPort, (newValue) => {
      if (newValue) {
        // emit('resetViewPort', false)
        Object.keys(state.gridState).forEach((key: string) => {
          resetViewPort(null, key)
        })
      }
    })

    const defaultImagePosition = () => ({
      // This is a function so that it always makes a separate copy for each image
      zoom: 1,
      xOffset: 0,
      yOffset: 0,
    })

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

    const getIntensity = (ionImage: IonImage, lockedIntensities: any = []) => {
      if (ionImage != null) {
        const {
          minIntensity, maxIntensity,
          clippedMinIntensity, clippedMaxIntensity,
          scaledMinIntensity, scaledMaxIntensity,
          userMinIntensity, userMaxIntensity,
          lowQuantile, highQuantile,
        } = ionImage
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
      return {
        min: getIntensityData(0, 0, 0, 0, 0, false),
        max: getIntensityData(0, 0, 0, 0, 0, false),
      }
    }

    const ionImage = (ionImagePng: any, isotopeImage: any,
      scaleType: any = 'linear', userScaling: any = [0, 1], normalizedData: any = null) => {
      if (!isotopeImage || !ionImagePng) {
        return null
      }
      const { minIntensity, maxIntensity } = isotopeImage
      return processIonImage(ionImagePng, minIntensity, maxIntensity, scaleType
        , userScaling, undefined, normalizedData)
    }

    const ionImageLayers = (key: string) => {
      const annotation = state.annotationData[key]
      const gridCell = state.gridState[key]

      if (annotation == null || gridCell == null) {
        return []
      }
      const finalImage = ionImage(gridCell.ionImagePng,
        annotation.isotopeImages[0],
        props.scaleType, gridCell.imageScaledScaling,
        props.isNormalized && props.normalizationData
          ? props.normalizationData[annotation.dataset.id] : null)
      const hasOpticalImage = annotation.dataset.opticalImages[0]?.url !== undefined

      if (finalImage) {
        return [{
          ionImage: finalImage,
          colorMap: createColormap(props.colormap,
            hasOpticalImage && gridCell.showOpticalImage
              ? 'linear' : 'constant',
            hasOpticalImage && gridCell.showOpticalImage
              ? (gridCell.annotImageOpacity || 1) : 1),
        }]
      }
      return []
    }

    const resetViewPort = (event: any, key: string) => {
      if (event) {
        event.stopPropagation()
      }
      if (state.gridState[key]) {
        state.gridState[key]!.imagePosition = defaultImagePosition()
      }
    }

    const toggleOpticalImage = (event: any, key: string) => {
      event.stopPropagation()
      const gridCell = state.gridState[key]
      if (gridCell != null) {
        gridCell.showOpticalImage = !gridCell.showOpticalImage
        gridCell.annotImageOpacity = gridCell.showOpticalImage ? gridCell.annotImageOpacity : 1
      }
    }
    const formatMSM = (value: number) => {
      return value.toFixed(3)
    }

    const formatFDR = (value: number) => {
      return value ? `${Math.round(value * 100)}%` : '-'
    }

    const removeLayer = (index: number) => {
      $store.commit('removeChannel', { index })
    }

    const addLayer = () => {
      const selectedAnnotationsLength = Object.keys($store.state.channels).length
      const nOfChannels = Object.keys(channels).length
      const channel = Object.keys(channels)[selectedAnnotationsLength % nOfChannels]

      $store.commit('addChannel', { id: undefined, settings: { channel, visible: true } })
    }

    const handleLayerColorChange = (channel: string, index: number) => {
      $store.commit('updateChannel', {
        ...$store.state.channels[index],
        index,
        settings: { channel: channel, visible: $store.state.channels[index].settings.visible },
      })
    }

    const toggleChannelVisibility = (index: number) => {
      $store.commit('updateChannel', {
        ...$store.state.channels[index],
        index,
        settings: {
          channel: $store.state.channels[index].settings.channel,
          visible: !$store.state.channels[index].settings.visible,
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

    const handleUserScalingChange = (userScaling: any, key: string, ignoreBoundaries: boolean = false) => {
      const gridCell = state.gridState[key]
      if (gridCell == null) {
        return
      }
      const maxIntensity = gridCell.intensity.max.clipped || gridCell.intensity.max.image
      const minScale =
        gridCell.intensity?.min?.status === 'LOCKED'
          ? userScaling[0] * (1
          - (gridCell.intensity.min.user / maxIntensity))
          + (gridCell.intensity.min.user / maxIntensity)
          : userScaling[0]

      const maxScale = userScaling[1] * (gridCell.intensity?.max?.status === 'LOCKED'
        ? gridCell.intensity.max.user / maxIntensity : 1)
      const rangeSliderScale = userScaling.slice(0)

      // added in order to keep consistency even with ignore boundaries
      if (rangeSliderScale[0] < 0 || (gridCell.intensity?.min?.status === 'LOCKED' && ignoreBoundaries)) {
        rangeSliderScale[0] = 0
      }
      if (rangeSliderScale[1] > 1 || (gridCell.intensity?.max?.status === 'LOCKED' && ignoreBoundaries)) {
        rangeSliderScale[1] = 1
      }

      gridCell.userScaling = rangeSliderScale
      gridCell.imageScaledScaling = [minScale, maxScale]

      const maxScaleDisplay = globalLockedIntensities.value && globalLockedIntensities.value[1]
        ? globalLockedIntensities.value[1] : (gridCell.intensity.max.clipped || gridCell.intensity.max.image)

      const minScaleDisplay = globalLockedIntensities.value && globalLockedIntensities.value[0]
        ? globalLockedIntensities.value[0] : 0

      gridCell.intensity.min.scaled =
        gridCell.intensity?.min?.status === 'LOCKED'
        && maxIntensity * userScaling[0]
        < gridCell.intensity.min.user
          ? minScaleDisplay
          : maxIntensity * userScaling[0]

      gridCell.intensity.max.scaled =
        gridCell.intensity?.max?.status === 'LOCKED'
        && maxIntensity * userScaling[1]
        > gridCell.intensity.max.user
          ? maxScaleDisplay
          : maxIntensity * userScaling[1]
    }

    const handleIonIntensityChange = (intensity: number | undefined, key: string, type: string,
      ignoreBoundaries : boolean = true) => {
      const gridCell = state.gridState[key]
      if (gridCell == null || intensity === undefined) {
        return
      }
      let minScale = gridCell.userScaling[0]
      let maxScale = gridCell.userScaling[1]
      const maxIntensity = gridCell.intensity.max.clipped || gridCell.intensity.max.image

      if (type === 'min') {
        minScale = intensity / maxIntensity
      } else {
        maxScale = intensity / maxIntensity
      }

      if (!ignoreBoundaries) {
        minScale = minScale > 1 ? 1 : minScale
        minScale = minScale > maxScale ? maxScale : minScale
        minScale = minScale < 0 ? 0 : minScale
        maxScale = maxScale > 1 ? 1 : maxScale
        maxScale = maxScale < 0 ? 0 : maxScale
        maxScale = maxScale < minScale ? minScale : maxScale
      }

      handleUserScalingChange([minScale, maxScale], key, ignoreBoundaries)
    }

    const handleIonIntensityLockChange = (value: number | undefined, key: string, type: string) => {
      const gridCell = state.gridState[key]
      if (gridCell == null) {
        return
      }

      const minLocked = type === 'min' ? value : gridCell.lockedIntensities[0]
      const maxLocked = type === 'max' ? value : gridCell.lockedIntensities[1]
      const intensity = getIntensity(gridCell.ionImageLayers[0]?.ionImage, [minLocked, maxLocked])

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
        gridCell.imageScaledScaling = [0, gridCell.imageScaledScaling[1]]
      }
      if (intensity && intensity.max !== undefined && intensity.max.status !== 'LOCKED') {
        intensity.max.scaled = intensity.max.clipped || intensity.max.image
        gridCell.imageScaledScaling = [gridCell.imageScaledScaling[0], 1]
      }

      gridCell.lockedIntensities = [minLocked, maxLocked]
      emit('intensitiesChange', [minLocked, maxLocked])

      gridCell.intensity = intensity
      gridCell.userScaling = [0, 1]
    }

    const handleIonIntensityLockAllByTemplate = async(dsId: string) => {
      let maxIntensity
      let minIntensity

      Object.keys(settings.value.grid).map((key) => {
        const cellId = settings.value.grid[key]
        if (cellId === dsId) {
          const gridCell : GridCellState = state.gridState[key]!
          if (gridCell && gridCell.intensity) {
            maxIntensity = gridCell.intensity.max.clipped || gridCell.intensity.max.image
            minIntensity = 0
            emit('intensitiesChange', [minIntensity, maxIntensity])
          }
        }
      })

      for (let i = 0; i < Object.keys(settings.value.grid).length; i++) {
        const key = Object.keys(settings.value.grid)[i]
        await handleIonIntensityLockChange(maxIntensity, key, 'max')
        await handleIonIntensityLockChange(minIntensity, key, 'min')
        handleIonIntensityChange(minIntensity, key, 'min', true)
        handleIonIntensityChange(maxIntensity, key, 'max', true)
      }
    }

    const renderDatasetName = (name: string) => {
      return (
        <div class='ds-comparison-item-line'>
          <span class='dataset-comparison-grid-ds-name truncate'>{name}</span>
        </div>
      )
    }

    const getChannels = (dsId: string) => {
      const channels : any[] = []
      const annotations: any[] = []
      $store.state.channels.forEach((channel: any) => {
        const idx = (channel.annotations?.datasetIds || []).indexOf(dsId)
        channels.push(channel)

        if (idx !== -1) {
          annotations.push(channel.annotations.annotations[idx])
        } else if (channel.id) {
          annotations.push({ ...channel.annotations.annotations[0], isEmpty: true })
        }
      })
      return { annotations, channels }
    }

    const renderImageViewerHeaders = (row: number, col: number) => {
      const key = `${row}-${col}`
      const gridCell = state.gridState[key]
      const annData = state.annotationData[key]
      const dataset =
        props.datasets
          ? props.datasets.find((dataset: any) => dataset.id === settings.value.grid[`${row}-${col}`])
          : null
      const { annotations, channels } = getChannels(dataset?.id)
      const isEmpty = $store.state.mode === 'MULTI' ? annotations.filter((item: any) => !item.isEmpty).length === 0
        : (!props.isLoading && annData === null && gridCell === null)
          || (!props.isLoading && props.selectedAnnotation === -1)
          || (props.selectedAnnotation >= props.annotations.length)

      if (isEmpty) {
        return (
          <div key={col} class='dataset-comparison-grid-col overflow-hidden items-center justify-start'
            style={{ height: 200, width: 200 }}>
            {renderDatasetName(dataset?.name)}
            <span>No data</span>
          </div>)
      }

      if (props.isNormalized && dataset && dataset.id
        && props.normalizationData[dataset.id] && props.normalizationData[dataset.id].error) {
        return (
          <div key={col} class='dataset-comparison-grid-col overflow-hidden relative'
            style={{ height: 200, width: 200 }}>
            {renderDatasetName(dataset?.name)}
            <div
              class="normalization-error-wrapper"
            >
              <i class="el-icon-error info-icon mr-2" />
              <p class="text-lg">
              There was an error on normalization!
              </p>
            </div>
          </div>
        )
      }
      return (
        <div key={col} class='dataset-comparison-grid-col overflow-hidden relative'
          style={{ height: 200, width: 200 }}>
          {renderDatasetName(dataset?.name)}
          <MainImageHeader
            class='dataset-comparison-grid-item-header dom-to-image-hidden'
            annotation={annData}
            slot="title"
            isActive={false}
            hideOptions={true}
            showOpticalImage={!!gridCell?.showOpticalImage}
            toggleOpticalImage={(e: any) => toggleOpticalImage(e, key)}
            resetViewport={(e: any) => resetViewPort(e, key)}
            hasOpticalImage={
              annData?.dataset?.opticalImages[0]?.url
              !== undefined}
          />
          {
            annData
            && annData.msmScore
            && <div class="dataset-comparison-extra dom-to-image-hidden">
              <div class="dataset-comparison-msm-badge">
                MSM <b>{formatMSM(annData.msmScore)}</b>
              </div>
              <div class="dataset-comparison-fdr-badge">
                FDR <b>{formatFDR(annData.fdrLevel)}</b>
              </div>
              <Popover
                trigger="hover"
                placement="right"
              >
                <div slot="reference" class="dataset-comparison-link">
                  <RouterLink
                    target='_blank'
                    to={annotationsLink(annData.dataset.id.toString(),
                      annData.databaseDetails.id.toString(),
                      annData.databaseDetails.fdrLevel)}>
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
              && <SimpleIonImageViewer
                annotations={annotations.length > 0 && $store.state.mode === 'MULTI' ? annotations : [annData]}
                channels={channels}
                isActive={$store.state.mode === 'MULTI'}
                dataset={annData?.dataset}
                height={dimensions.height}
                width={dimensions.width}
                scaleBarColor={props.scaleBarColor}
                lockedIntensityTemplate={props.lockedIntensityTemplate}
                globalLockedIntensities={props.globalLockedIntensities}
                scaleType={props.scaleType}
                onIntensitiesChange={(intensity: any) => { emit('intensitiesChange', intensity) }}
                onLockAllIntensities={() => { emit('lockAllIntensities') }}
                colormap={props.colormap}
                isNormalized={props.isNormalized}
                normalizationData={props.normalizationData
                  ? props.normalizationData[annData?.dataset?.id] : null}
                showOpticalImage={!!gridCell?.showOpticalImage}
                resetViewPort={props.resetViewPort}
                onResetViewPort={() => { emit('resetViewPort', false) }}
                onRemoveLayer={removeLayer}
                onChangeLayer={handleLayerColorChange}
                onAddLayer={addLayer}
                onToggleVisibility={toggleChannelVisibility}
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
            range(props.nRows).map((row) => {
              return (
                <div key={row} class='dataset-comparison-grid-row'>
                  {
                    range(props.nCols).map((col) => {
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
