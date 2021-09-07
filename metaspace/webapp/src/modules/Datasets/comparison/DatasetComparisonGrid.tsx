import { computed, defineComponent, onMounted, onUnmounted, reactive, watch } from '@vue/composition-api'
import './DatasetComparisonGrid.scss'
import MainImageHeader from '../../Annotations/annotation-widgets/default/MainImageHeader.vue'
import Vue from 'vue'
import createColormap from '../../../lib/createColormap'
import { IonImage, loadPngFromUrl, processIonImage, renderScaleBar } from '../../../lib/ionImageRendering'
import IonImageViewer from '../../../components/IonImageViewer'
import safeJsonParse from '../../../lib/safeJsonParse'
import fitImageToArea, { FitImageToAreaResult } from '../../../lib/fitImageToArea'
import FadeTransition from '../../../components/FadeTransition'
import OpacitySettings from '../../ImageViewer/OpacitySettings.vue'
import RangeSlider from '../../../components/Slider/RangeSlider.vue'
import IonIntensity from '../../ImageViewer/IonIntensity.vue'
import ImageSaver from '../../ImageViewer/ImageSaver.vue'
import getColorScale from '../../../lib/getColorScale'
import { THUMB_WIDTH } from '../../../components/Slider'
import { encodeParams } from '../../Filters'
import StatefulIcon from '../../../components/StatefulIcon.vue'
import { ExternalWindowSvg } from '../../../design/refactoringUIIcons'
import { Popover } from '../../../lib/element-ui'
import { ImagePosition } from '../../ImageViewer/ionImageState'
import { range } from 'lodash-es'
import config from '../../../lib/config'

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
  lockedIntensityTemplate: string
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
  globalLockedIntensities: [number | undefined, number | undefined]
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
    lockedIntensityTemplate: {
      type: String,
    },
  },
  // @ts-ignore
  setup: function(props, { refs, emit, root }) {
    const { $route, $store } = root

    const state = reactive<DatasetComparisonGridState>({
      gridState: {},
      grid: undefined,
      annotations: [],
      globalLockedIntensities: [undefined, undefined],
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
      }

      const intensity = getIntensity(gridCell.ionImageLayers[0]?.ionImage)

      intensity.min.scaled = 0
      intensity.max.scaled = state.globalLockedIntensities && state.globalLockedIntensities[1]
        ? state.globalLockedIntensities[1] : (intensity.max.clipped || intensity.max.image)
      gridCell.intensity = intensity
      gridCell.lockedIntensities = state.globalLockedIntensities
      // persist ion intensity lock status
      if (gridCell.lockedIntensities !== undefined) {
        if (gridCell.lockedIntensities[0] !== undefined) {
          await handleIonIntensityLockChange(gridCell.lockedIntensities[0], key, 'min')
        }
        if (gridCell.lockedIntensities[1] !== undefined) {
          await handleIonIntensityLockChange(gridCell.lockedIntensities[1], key, 'max')
        }
      }
    }

    const updateAnnotationData = (grid: any, annotationIdx = 0) => {
      if (!grid || !props.annotations || props.annotations.length === 0 || annotationIdx === -1) {
        state.annotationData = {}
        state.gridState = {}
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
          const minIntensity = gridCell.intensity.min.clipped || gridCell.intensity.min.image
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
        emit('resetViewPort', false)
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
      scaleType: any = 'linear', userScaling: any = [0, 1]) => {
      if (!isotopeImage || !ionImagePng) {
        return null
      }
      const { minIntensity, maxIntensity } = isotopeImage
      return processIonImage(ionImagePng, minIntensity, maxIntensity, scaleType, userScaling)
    }

    const ionImageLayers = (key: string) => {
      const annotation = state.annotationData[key]
      const gridCell = state.gridState[key]

      if (annotation == null || gridCell == null) {
        return []
      }
      const finalImage = ionImage(gridCell.ionImagePng,
        annotation.isotopeImages[0],
        props.scaleType, gridCell.imageScaledScaling)
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

    const handleImageMove = ({ zoom, xOffset, yOffset }: any, key: string) => {
      const gridCell = state.gridState[key]
      if (gridCell != null) {
        gridCell.imagePosition.zoom = zoom / gridCell.imageFit.imageZoom
        gridCell.imagePosition.xOffset = xOffset
        gridCell.imagePosition.yOffset = yOffset
      }
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

    const handleOpacityChange = (opacity: any, key: string) => {
      state.gridState[key]!.annotImageOpacity = opacity
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

      const maxScaleDisplay = state.globalLockedIntensities && state.globalLockedIntensities[1]
        ? state.globalLockedIntensities[1] : (gridCell.intensity.max.clipped || gridCell.intensity.max.image)

      gridCell.intensity.min.scaled =
        gridCell.intensity?.min?.status === 'LOCKED'
        && maxIntensity * userScaling[0]
        < gridCell.intensity.min.user
          ? maxScaleDisplay
          : maxIntensity * userScaling[0]

      gridCell.intensity.max.scaled =
        gridCell.intensity?.max?.status === 'LOCKED'
        && maxIntensity * userScaling[1]
        > gridCell.intensity.max.user
          ? maxScaleDisplay
          : maxIntensity * userScaling[1]
    }

    const handleIonIntensityChange = (intensity: number | undefined, key: string, type: string,
      ignoreBoundaries : boolean = false) => {
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
      state.globalLockedIntensities = [minLocked, maxLocked]
      gridCell.intensity = intensity
      gridCell.userScaling = [0, 1]
    }

    const handleIonIntensityLockChangeForAll = (value: number, key: string, type: string) => {
      // apply max lock to all grids
      Object.keys(state.gridState).forEach((gridKey) => {
        handleIonIntensityLockChange(value, gridKey, type)
        if (value && gridKey !== key) {
          handleIonIntensityChange(value, gridKey, type, true)
        }
      })

      // emit lock all (used to reset template lock if set)
      if (props.lockedIntensityTemplate) {
        emit('lockAllIntensities')
      }
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
            minIntensity = gridCell.intensity.min.clipped || gridCell.intensity.min.image
            state.globalLockedIntensities = [minIntensity, maxIntensity]
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

    const renderDatasetName = (row: number, col: number) => {
      const dataset =
        props.datasets
          ? props.datasets.find((dataset: any) => dataset.id === settings.value.grid[`${row}-${col}`])
          : null
      return (
        <span class='dataset-comparison-grid-ds-name'>{dataset?.name?.substring(0, 39)}
          {dataset?.name?.length > 40 ? '...' : ''}</span>
      )
    }

    const renderImageViewerHeaders = (row: number, col: number) => {
      const key = `${row}-${col}`
      const gridCell = state.gridState[key]
      const annData = state.annotationData[key]

      if (
        (!props.isLoading && annData == null && gridCell == null)
        || (!props.isLoading && props.selectedAnnotation === -1)
        || (props.selectedAnnotation >= props.annotations.length)
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
          {gridCell && renderDatasetName(row, col)}
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
              && gridCell
              && gridCell.ionImageLayers
              && <IonImageViewer
                isLoading={props.isLoading || !state.firstLoaded}
                ionImageLayers={gridCell.ionImageLayers}
                scaleBarColor={props.scaleBarColor}
                scaleType={props.scaleType}
                pixelSizeX={gridCell.pixelSizeX}
                pixelSizeY={gridCell.pixelSizeY}
                pixelAspectRatio={gridCell.pixelAspectRatio}
                imageHeight={gridCell.ionImageLayers[0]?.ionImage?.height }
                imageWidth={gridCell.ionImageLayers[0]?.ionImage?.width }
                height={dimensions.height}
                width={dimensions.width}
                zoom={gridCell.imagePosition?.zoom
                * gridCell.imageFit.imageZoom}
                minZoom={gridCell.imageFit.imageZoom / 4}
                maxZoom={gridCell.imageFit.imageZoom * 20}
                xOffset={gridCell.imagePosition?.xOffset || 0}
                yOffset={gridCell.imagePosition?.yOffset || 0}
                opticalSrc={gridCell.showOpticalImage
                  ? annData?.dataset?.opticalImages[0]?.url
                  : undefined}
                opticalTransform={gridCell.showOpticalImage
                  ? annData?.dataset?.opticalImages[0]?.transform
                  : undefined}
                scrollBlock
                showPixelIntensity
                onMove={(e: any) => handleImageMove(e, key)}
              />
            }
            <div class="ds-viewer-controls-wrapper  v-rhythm-3 sm-side-bar">
              <FadeTransition class="absolute bottom-0 right-0 mt-3 ml-3 dom-to-image-hidden">
                {
                  gridCell?.showOpticalImage
                  && annData?.dataset?.opticalImages[0]?.url
                  !== undefined
                  && <OpacitySettings
                    key="opacity"
                    class="ds-comparison-opacity-item sm-leading-trim mt-auto dom-to-image-hidden"
                    opacity={gridCell.annotImageOpacity !== undefined
                      ? gridCell.annotImageOpacity : 1}
                    onOpacity={(opacity: number) => handleOpacityChange(opacity, key)}
                  />
                }
              </FadeTransition>
              <FadeTransition class="absolute top-0 right-0 mt-3 ml-3 dom-to-image-hidden">
                {
                  state.refsLoaded
                  && gridCell != null
                  && gridCell.userScaling
                  && <div
                    class="p-3 bg-gray-100 rounded-lg box-border shadow-xs"
                    ref={`range-slider-${row}-${col}`}>
                    <RangeSlider
                      class="ds-comparison-opacity-item"
                      value={gridCell.userScaling}
                      min={0}
                      max={1}
                      step={0.01}
                      style={buildRangeSliderStyle(key)}
                      onInput={(nextRange: number[]) =>
                        handleUserScalingChange(nextRange, key)}
                    />
                    <div
                      class="ds-intensities-wrapper">
                      <IonIntensity
                        intensities={gridCell.intensity?.min}
                        label="Minimum intensity"
                        placeholder="min."
                        onInput={(value: number) =>
                          handleIonIntensityChange(value, key,
                            'min')}
                        onLock={(value: number) =>
                          handleIonIntensityLockChangeForAll(value, key, 'min')}
                      />
                      <IonIntensity
                        intensities={gridCell.intensity?.max}
                        label="Minimum intensity"
                        placeholder="min."
                        onInput={(value: number) =>
                          handleIonIntensityChange(value, key,
                            'max')}
                        onLock={(value: number) =>
                          handleIonIntensityLockChangeForAll(value, key, 'max')}
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
