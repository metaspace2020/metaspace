import { computed, defineComponent, onMounted, reactive, ref, watch } from '@vue/composition-api'
import './SimpleIonImageViewer.scss'
import IonImageViewer from '../IonImageViewer'
import fitImageToArea, { FitImageToAreaResult } from '../../lib/fitImageToArea'
import { ImagePosition } from '../../modules/ImageViewer/ionImageState'
import { IonImage, loadPngFromUrl, processIonImage, renderScaleBar } from '../../lib/ionImageRendering'
import config from '../../lib/config'
import createColormap from '../../lib/createColormap'
import Vue from 'vue'
import safeJsonParse from '../../lib/safeJsonParse'
import ImageSaver from '../../modules/ImageViewer/ImageSaver.vue'
import FadeTransition from '../FadeTransition'
import OpacitySettings from '../../modules/ImageViewer/OpacitySettings.vue'
import { MultiChannelController } from '../MultiChannelController/MultiChannelController'
import { cloneDeep, isEqual } from 'lodash'

interface SimpleIonImageViewerProps {
  isActive: boolean
  resetViewPort: boolean
  hideClipping: boolean
  isNormalized: boolean
  forceUpdate: boolean
  keepPixelSelected: boolean
  showOpticalImage: boolean
  normalizationData: any
  dataset: any
  width: number
  height: number
  annotations: any[]
  scaleType: string
  scaleBarColor: string
  colormap: string
  lockedIntensityTemplate: string
  globalLockedIntensities: [number | undefined, number | undefined]
  channels: any[]
  showChannels: boolean
  imageTitle: string
}

interface ImageSettings {
  intensities: any
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
  scaleBarUrl: Readonly<string[]>,
}

interface SimpleIonImageViewerState {
  imageSettings: ImageSettings | any,
  colorSettings: any
  ionImagePosByKey: any
  ionImagePng: any
  menuItems: any[]
  imageHeight: number
  imageWidth: number
  currentIon: any
  mode: string
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

export const SimpleIonImageViewer = defineComponent<SimpleIonImageViewerProps>({
  name: 'SimpleIonImageViewer',
  props: {
    annotations: { type: Array, default: () => [] },
    hideClipping: { type: Boolean, required: false, default: false },
    isActive: { type: Boolean, required: false, default: false },
    keepPixelSelected: { type: Boolean, required: false, default: false },
    showChannels: { type: Boolean, required: false, default: true },
    width: { type: Number, required: false },
    height: { type: Number, required: false },
    colormap: {
      type: String,
      default: 'Viridis',
    },
    channels: {
      type: Array,
      default: () => [],
    },
    scaleType: {
      type: String,
      default: 'linear',
    },
    scaleBarColor: {
      type: String,
      default: '#000000',
    },
    imageTitle: {
      type: String,
    },
    forceUpdate: {
      type: Boolean,
      default: false,
    },
    showOpticalImage: {
      type: Boolean,
      default: true,
    },
    isNormalized: {
      type: Boolean,
      default: false,
    },
    resetViewPort: {
      type: Boolean,
      default: false,
    },
    normalizationData: {
      type: Object,
      default: null,
    },
    globalLockedIntensities: {
      type: Array,
      default: () => [undefined, undefined],
    },
    dataset: {
      type: Object,
      default: () => {},
    },
    lockedIntensityTemplate: {
      type: String,
    },
  },
  setup(props, { emit, root }) {
    const { $store } = root
    const state = reactive<SimpleIonImageViewerState>({
      imageSettings: null,
      colorSettings: {},
      ionImagePng: null,
      menuItems: [],
      imageHeight: 0,
      imageWidth: 0,
      ionImagePosByKey: {},
      currentIon: null,
      mode: 'SINGLE',
    })

    const container = ref(null)
    const globalLockedIntensities = computed(() => props.globalLockedIntensities)
    const mode = computed(() => props.isActive ? 'MULTI' : 'SINGLE')
    const ionKeys = computed(() => {
      return props.annotations.map((annotation: any, index: number) => {
        return annotation?.ion || index
      })
    })

    onMounted(() => {
      startImageSettings()
    })

    // reset view port globally
    watch(() => props.resetViewPort, (newValue) => {
      if (newValue) {
        emit('resetViewPort', false)
        resetViewPort()
      }
    })

    const resetViewPort = () => {
      if (state.imageSettings) {
        state.imageSettings!.imagePosition = defaultImagePosition()
      }
    }

    const getMetadata = (annotation: any) => {
      if (!annotation) {
        return {}
      }

      const datasetMetadataExternals = {
        Submitter: annotation.dataset?.submitter,
        PI: annotation.dataset?.principalInvestigator,
        Group: annotation.dataset?.group,
        Projects: annotation.dataset?.projects,
      }
      return Object.assign(safeJsonParse(annotation.dataset.metadataJson), datasetMetadataExternals)
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

    const ionImageLayers = () => {
      const { annotations, isNormalized, normalizationData } = props
      const { imageSettings, colorSettings } = state

      if (annotations === null || annotations[0] === null || imageSettings == null || colorSettings === null) {
        return []
      }

      const ionImages = []

      for (let index = 0; index < annotations?.length; index++) {
        if (index > 0 && mode.value === 'SINGLE') {
          break
        }
        const annotation = annotations[index]
        const key = ionKeys.value[index]

        if (!annotation || annotation?.isEmpty) {
          continue
        }
        const ionImagePng = state.ionImagePng[index]

        const finalImage = ionImage(ionImagePng,
          annotation.isotopeImages[0],
          props.scaleType, state.menuItems[index]?.imageScaledScaling,
          isNormalized && normalizationData
            ? normalizationData : null)
        const hasOpticalImage = annotation?.dataset?.opticalImages[0]?.url !== undefined
        state.imageHeight = finalImage?.height || 0
        state.imageWidth = finalImage?.width || 0

        if (finalImage) {
          ionImages.push({
            visible: state.menuItems[index].settings.visible.value,
            ionImage: finalImage,
            colorMap: createColormap(state.menuItems[index]?.settings?.channel?.value || colorSettings[index].value,
              hasOpticalImage && props.showOpticalImage
                ? 'linear' : 'constant',
              hasOpticalImage && props.showOpticalImage
                ? (imageSettings.annotImageOpacity !== null && imageSettings.annotImageOpacity !== undefined
                  ? imageSettings.annotImageOpacity : 1) : 1),
          })
          Vue.set(state.ionImagePosByKey, key, ionImages.length - 1)
        }
      }

      return ionImages.filter((a: any) => a !== null)
    }

    const scaleBars = () => {
      const { annotations } = props
      const { imageSettings } = state

      return annotations.map((annotation: any, index: number) => {
        const key = ionKeys.value[index]
        const ionImagePos = state.ionImagePosByKey[key]
        if (!imageSettings.ionImageLayers[ionImagePos]?.ionImage) {
          return null
        }
        return renderScaleBar(
          imageSettings.ionImageLayers[ionImagePos]?.ionImage,
          createColormap(props.colormap),
          true,
        )
      })
    }

    const imageFit = () => {
      const { imageSettings } = state
      const { width = props.width, height = props.height } = imageSettings?.ionImagePng || {}

      return fitImageToArea({
        imageWidth: width,
        imageHeight: height / (imageSettings?.pixelAspectRatio || 1),
        areaWidth: props.width,
        areaHeight: props.height,
      })
    }

    const defaultImagePosition = () => ({
      // This is a function so that it always makes a separate copy for each image
      zoom: 1,
      xOffset: 0,
      yOffset: 0,
    })

    const scaleBar = (index: number) => {
      const key = ionKeys.value[index]
      const ionImagePos = state.ionImagePosByKey[key]

      if (state.imageSettings.ionImageLayers && state.imageSettings.ionImageLayers[ionImagePos]) {
        return renderScaleBar(
          state.imageSettings?.ionImageLayers[ionImagePos]?.ionImage,
          createColormap(state.menuItems[index]?.settings?.channel?.value || state.colorSettings[index]?.value),
          true,
        )
      } else {
        return null
      }
    }

    const getIntensities = (index: number) => {
      const key = ionKeys.value[index]
      return state.imageSettings?.intensities[key]
    }

    const minIntensity = (index: number) => {
      const key = ionKeys.value[index]
      const ionImagePos = state.ionImagePosByKey[key]
      const { scaledMinIntensity } = state.imageSettings?.ionImageLayers[ionImagePos]?.ionImage || {}
      return scaledMinIntensity
    }

    const maxIntensity = (index: number) => {
      const key = ionKeys.value[index]
      const ionImagePos = state.ionImagePosByKey[key]

      const { scaledMaxIntensity } = state.imageSettings?.ionImageLayers[ionImagePos]?.ionImage || {}
      return scaledMaxIntensity
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

    const startImageSettings = async(forceUpdate = props.forceUpdate) => {
      const { annotations } = props
      const annotation = annotations.filter((item: any) => !item?.isEmpty)[0]
      const ionImagesPng = []
      const menuItems = []

      const metadata = getMetadata(annotation)
      // eslint-disable-next-line camelcase
      const pixelSizeX = metadata?.MS_Analysis?.Pixel_Size?.Xaxis || 0
      // eslint-disable-next-line camelcase
      const pixelSizeY = metadata?.MS_Analysis?.Pixel_Size?.Yaxis || 0
      let nonEmptyIndex = 0

      const hasPreviousSettings = state.imageSettings !== null
      const intensitiesSnapshot = state.imageSettings?.intensities
      const menuItemsSnapshot = cloneDeep(state.menuItems) || []

      for (let i = 0; i < annotations?.length; i++) {
        const annotationItem = annotations[i]
        if (!annotationItem) {
          continue
        }
        state.colorSettings[i] = computed(() => mode.value === 'SINGLE'
          ? props.colormap : (props.channels.length > i ? props.channels[i].settings.channel
            : Object.keys(channels)[i % Object.keys(channels).length]))
        const ionImagePng = await loadPngFromUrl(annotationItem.isotopeImages[0].url)
        ionImagesPng.push(ionImagePng)
        if (!annotationItem?.isEmpty) {
          nonEmptyIndex = i
        }

        const oldItem = menuItemsSnapshot.find((item: any) => item.annotation.ion === annotationItem.ion)

        menuItems.push(
          {
            annotation: annotationItem,
            isEmpty: annotationItem?.isEmpty,
            scaleBar: computed(() => scaleBar(i)),
            scaledMinIntensity: computed(() => minIntensity(i)),
            scaledMaxIntensity: computed(() => maxIntensity(i)),
            scaleBarUrl: state.imageSettings?.scaleBarUrl,
            intensity: computed(() => getIntensities(i)),
            userScaling: hasPreviousSettings && oldItem
              ? oldItem.userScaling : state.imageSettings?.userScaling || [0, 1],
            imageScaledScaling: hasPreviousSettings && oldItem
              ? oldItem.imageScaledScaling : state.imageSettings?.imageScaledScaling || [0, 1],
            scaleRange: hasPreviousSettings && oldItem
              ? oldItem.userScaling : state.imageSettings?.userScaling || [0, 1],
            state: {
              maxIntensity: state.imageSettings?.intensity?.max?.scaled,
              minIntensity: state.imageSettings?.intensity?.min?.scaled,
              popover: null,
              scaleRange: state.imageSettings?.userScaling,
            },
            settings: {
              channel: computed(() => mode.value === 'SINGLE'
                ? props.colormap : (props.channels.length > i ? props.channels[i].settings.channel
                  : Object.keys(channels)[i % Object.keys(channels).length])),
              label: 'none',
              visible: computed(() => (props.channels.length > i ? props.channels[i].settings.visible
                : true)),
            },
          },
        )
      }

      state.ionImagePng = ionImagesPng

      const imageSettings : any | ImageSettings = reactive({
        intensities: {}, // @ts-ignore // Gets set later, because ionImageLayers needs state.gridState[key] set
        ionImagePng: ionImagesPng[nonEmptyIndex],
        pixelSizeX,
        pixelSizeY,
        // ionImageLayers and imageFit rely on state.gridState[key] to be correctly set - avoid evaluating them
        // until this has been inserted into state.gridState
        ionImageLayers: computed(() => ionImageLayers()),
        imageFit: computed(() => imageFit()),
        lockedIntensities: [undefined, undefined],
        annotImageOpacity: hasPreviousSettings ? state.imageSettings.annotImageOpacity : 1.0,
        opticalOpacity: hasPreviousSettings ? state.imageSettings.opticalOpacity : 1.0,
        imagePosition: hasPreviousSettings ? state.imageSettings.imagePosition : defaultImagePosition(),
        pixelAspectRatio:
            config.features.ignore_pixel_aspect_ratio ? 1
              : pixelSizeX && pixelSizeY && pixelSizeX / pixelSizeY || 1,
        imageZoom: 1,
        showOpticalImage: props.showOpticalImage,
        userScaling: [0, 1],
        imageScaledScaling: [0, 1],
        scaleBarUrl: computed(() => scaleBars()),
      })
      state.menuItems = menuItems
      Vue.set(state, 'imageSettings', imageSettings)

      state.imageSettings.lockedIntensities = globalLockedIntensities.value as [number | undefined, number | undefined]
      let ionImagePosAux = 0
      for (let index = 0; index < menuItems?.length; index++) {
        const key = ionKeys.value[index]
        if (!forceUpdate && hasPreviousSettings && intensitiesSnapshot[key]) {
          Vue.set(state.imageSettings.intensities, key, intensitiesSnapshot[key])
        } else {
          const ionImagePos = state.ionImagePosByKey[key] || ionImagePosAux
          const intensity = getIntensity(imageSettings.ionImageLayers[ionImagePos]?.ionImage)
          intensity.min.scaled = 0
          intensity.max.scaled = globalLockedIntensities.value && globalLockedIntensities.value[1]
            ? globalLockedIntensities.value[1] : (intensity.max.clipped || intensity.max.image)
          Vue.set(state.imageSettings.intensities, key, intensity)
        }

        if (!menuItems[index]?.isEmpty) {
          ionImagePosAux += 1
        }

        // persist ion intensity lock status
        if (state.imageSettings.lockedIntensities !== undefined) {
          if (state.imageSettings.lockedIntensities[0] !== undefined) {
            await handleIntensityLockChange(state.imageSettings.lockedIntensities[0], index, 'min', false)
            await handleIntensityChange(state.imageSettings.lockedIntensities[0], index, 'min')
          }
          if (state.imageSettings.lockedIntensities[1] !== undefined) {
            await handleIntensityLockChange(state.imageSettings.lockedIntensities[1], index, 'max', false)
            await handleIntensityChange(state.imageSettings.lockedIntensities[1], index, 'max')
          }
        }
      }

      if (props.lockedIntensityTemplate && props.lockedIntensityTemplate === props.dataset.id) {
        handleLockByTemplate()
      }
    }

    const handleImageMove = ({ zoom, xOffset, yOffset }: any) => {
      const gridCell = state.imageSettings
      if (gridCell != null) {
        gridCell.imagePosition.zoom = zoom / gridCell.imageFit.imageZoom
        gridCell.imagePosition.xOffset = xOffset
        gridCell.imagePosition.yOffset = yOffset
      }
    }

    const handlePixelSelect = (coordinates: any) => {
      emit('pixelSelected', coordinates)
    }

    const handleOpticalOpacityChange = (opacity: any) => {
      state.imageSettings!.opticalOpacity = opacity
    }

    const handleOpacityChange = (opacity: any) => {
      state.imageSettings!.annotImageOpacity = opacity
    }

    const toggleChannelVisibility = (index: any) => {
      emit('toggleVisibility', index)
    }

    const handleLayerColorChange = (channel: string, index: number) => {
      emit('changeLayer', channel, index)
    }

    const handleRemoveLayer = (index: number) => {
      emit('removeLayer', index)
    }

    const addLayer = () => {
      emit('addLayer')
    }

    const handleIntensityLockChange = (value: number | undefined, index: number, type: string,
      emitChange: boolean = true) => {
      if (state.imageSettings === null || state.menuItems[index]?.isEmpty || !state.menuItems[index]) {
        return
      }

      const minLocked = type === 'min' ? value : state.imageSettings.lockedIntensities[0]
      const maxLocked = type === 'max' ? value : state.imageSettings.lockedIntensities[1]
      const key = ionKeys.value[index]
      const ionImagePos = state.ionImagePosByKey[key]
      const intensity = getIntensity(state.imageSettings.ionImageLayers[ionImagePos]?.ionImage,
        [minLocked, maxLocked])

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
        state.menuItems[index].imageScaledScaling = [0, state.menuItems[index].imageScaledScaling[1]]
      }
      if (intensity && intensity.max !== undefined && intensity.max.status !== 'LOCKED') {
        intensity.max.scaled = intensity.max.clipped || intensity.max.image
        state.menuItems[index].imageScaledScaling = [state.menuItems[index].imageScaledScaling[0], 1]
      }

      state.imageSettings.lockedIntensities = [minLocked, maxLocked]
      if (emitChange) {
        emit('intensitiesChange', [minLocked, maxLocked])
      }

      state.menuItems[index].userScaling = [0, 1]
      Vue.set(state.imageSettings.intensities, key, intensity)
    }

    const handleIntensityLockChangeForAll = (value: number, index: number, type: string) => {
      // apply max lock to all grids
      Object.values(state.imageSettings.intensities).forEach((intensity: any, intensityIndex: number) => {
        if (mode.value === 'SINGLE' && intensityIndex > 0) {
          return
        }
        handleIntensityLockChange(value, intensityIndex, type)

        if (value && intensityIndex !== index) {
          handleIntensityChange(value, intensityIndex, type, true)
        }
      })

      // emit lock all (used to reset template lock if set)
      if (props.lockedIntensityTemplate) {
        emit('lockAllIntensities')
      }
    }

    const handleIntensityChange = (intensity: number | undefined, index: number, type: string,
      ignoreBoundaries : boolean = true) => {
      const key = ionKeys.value[index]

      if (state.imageSettings === null || intensity === undefined || state.menuItems === null
        || state.menuItems[index]?.isEmpty || !state.menuItems[index] || !state.imageSettings.intensities[key]) {
        return
      }
      let minScale = state.menuItems[index].userScaling[0]
      let maxScale = state.menuItems[index].userScaling[1]
      const maxIntensity = state.imageSettings.intensities[key].max.clipped
        || state.imageSettings.intensities[key].max.image

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

      handleUserScalingChange([minScale, maxScale], index, ignoreBoundaries)
    }

    const handleLockByTemplate = async() => {
      const key = ionKeys.value[0]
      const intensity = (state.imageSettings?.intensities || {})[key]
      if (!intensity) {
        return
      }
      const maxIntensity = intensity.max.clipped || intensity.max.image
      const minIntensity = 0
      emit('intensitiesChange', [minIntensity, maxIntensity])
    }

    const handleUserScalingChange = (userScaling: any, index: number, ignoreBoundaries: boolean = false) => {
      if (state.imageSettings === null || state.menuItems === null) {
        return
      }

      const key = ionKeys.value[index]
      const intensity = state.imageSettings.intensities[key]
      const maxIntensity =
        intensity.max.clipped || intensity.max.image
      const minScale = userScaling[0]
      const maxScale = userScaling[1] * (intensity?.max?.status === 'LOCKED'
        ? intensity?.max?.user / maxIntensity : 1)
      const rangeSliderScale = userScaling.slice(0)

      // added in order to keep consistency even with ignore boundaries
      if (rangeSliderScale[0] < 0 || (intensity?.min?.status === 'LOCKED' && ignoreBoundaries)) {
        rangeSliderScale[0] = 0
      }
      if (rangeSliderScale[1] > 1 || (intensity?.max?.status === 'LOCKED' && ignoreBoundaries)) {
        rangeSliderScale[1] = 1
      }

      state.menuItems[index].userScaling = rangeSliderScale
      state.menuItems[index].imageScaledScaling = [minScale, maxScale]

      const maxScaleDisplay = globalLockedIntensities.value && globalLockedIntensities.value[1]
        ? globalLockedIntensities.value[1] : (intensity.max.clipped || intensity.max.image)

      const minScaleDisplay = globalLockedIntensities.value && globalLockedIntensities.value[0]
        ? globalLockedIntensities.value[0] : 0

      intensity.min.scaled =
        intensity?.min?.status === 'LOCKED'
        && maxIntensity * userScaling[0]
        < intensity.min.user
          ? minScaleDisplay
          : maxIntensity * userScaling[0]

      intensity.max.scaled =
        intensity?.max?.status === 'LOCKED'
        && maxIntensity * userScaling[1]
        > intensity.max.user
          ? maxScaleDisplay
          : maxIntensity * userScaling[1]

      // emit('change', userScaling, index)
      Vue.set(state.imageSettings.intensities, key, intensity)
    }

    // set images and annotation related items when selected annotation changes
    watch(() => props.globalLockedIntensities, async(newValue) => {
      if (props.annotations && props.annotations.length > 0 && newValue
        && state.imageSettings && state.imageSettings.ionImageLayers
        && !isEqual(state.imageSettings.lockedIntensities, newValue)) {
        state.imageSettings.lockedIntensities = newValue as [number | undefined, number | undefined]
        for (let index = 0; index < (mode.value === 'SINGLE' ? 1 : props.annotations?.length); index++) {
          await handleIntensityLockChange(state.imageSettings.lockedIntensities[0], index, 'min', false)
          await handleIntensityChange(state.imageSettings.lockedIntensities[0], index, 'min')
          await handleIntensityLockChange(state.imageSettings.lockedIntensities[1], index, 'max', false)
          await handleIntensityChange(state.imageSettings.lockedIntensities[1], index, 'max')
        }
      }
    })

    watch(() => props.isNormalized, async(newValue) => {
      await startImageSettings(true)
    })

    watch(() => props.normalizationData, async(newValue) => {
      await startImageSettings(true)
    })

    // set images and annotation related items when selected annotation changes
    watch(() => props.annotations, async(newValue) => {
      if (props.forceUpdate) {
        await startImageSettings()
      } else if (
        newValue
        && state.menuItems
        && state.menuItems.length > 0
      ) {
        const newIons = newValue.slice(0).map((item: any) => item?.ion)
        const currentIons = state.menuItems.slice(0).map((item: any) => item?.annotation?.ion)
        const currentIon = newIons[newIons.length - 1]
        const currentMode = mode.value
        if (
          newIons.length < currentIons.length
          || (!isEqual(newIons, currentIons) && currentIon !== state.currentIon)
          || currentMode !== state.mode
        ) {
          state.currentIon = currentIon
          state.mode = currentMode
          await startImageSettings()
        }
      }
    })
    // set lock by template
    watch(() => props.lockedIntensityTemplate, (newValue) => {
      if (newValue && newValue === props.dataset.id) {
        handleLockByTemplate()
      } else if (newValue === undefined) {
        emit('intensitiesChange', [undefined, undefined])
      }
    })

    return () => {
      const { width, height, annotations, showOpticalImage } = props
      const { imageSettings } = state
      const nonEmptyAnnotations = annotations.filter((item: any) => !item?.isEmpty)
      const nonEmptyAnnotationIndex = annotations.findIndex((item: any) => !item?.isEmpty)
      const viewerWrapper : any = container.value || {}
      const imageTitle = props.imageTitle || (nonEmptyAnnotations[0]?.mz
        ? `${nonEmptyAnnotations[0]?.dataset?.name} - ${nonEmptyAnnotations[0]?.mz.toFixed(4)} m/z`
        : props.dataset?.name)
      const fileName = nonEmptyAnnotations[0]
        ? `${nonEmptyAnnotations[0]?.dataset?.id}_imzml_browser`
          .replace(/\./g, '_') : props.dataset.id

      if (!imageSettings || !imageSettings.ionImageLayers
        || !annotations) {
        return null
      }

      return (
        <div
          class={'ds-simple-ion-image-container relative'}
          style={{
            width,
            height,
          }}
        >
          <IonImageViewer
            ref={container}
            height={height}
            width={width}
            zoom={imageSettings!.imagePosition?.zoom
              * imageSettings!.imageFit?.imageZoom}
            xOffset={imageSettings!.imagePosition?.xOffset || 0}
            yOffset={imageSettings!.imagePosition?.yOffset || 0}
            isLoading={false}
            ionImageLayers={imageSettings!.ionImageLayers.filter((item:any) => item.visible)}
            scaleBarColor={props.scaleBarColor}
            scaleType={props.scaleType}
            pixelSizeX={imageSettings!.pixelSizeX}
            pixelSizeY={imageSettings!.pixelSizeY}
            pixelAspectRatio={imageSettings!.pixelAspectRatio}
            opticalOpacity={imageSettings!.opticalOpacity}
            imageHeight={imageSettings!.ionImageLayers[nonEmptyAnnotationIndex]?.ionImage?.height || state.imageHeight }
            imageWidth={imageSettings!.ionImageLayers[nonEmptyAnnotationIndex]?.ionImage?.width || state.imageWidth}
            minZoom={imageSettings!.imageFit.imageZoom / 4}
            maxZoom={imageSettings!.imageFit.imageZoom * 20}
            opticalSrc={props.showOpticalImage
              ? nonEmptyAnnotations[0]?.dataset?.opticalImages[0]?.url
              : undefined}
            opticalTransform={props.showOpticalImage
              ? nonEmptyAnnotations[0]?.dataset?.opticalImages[0]?.transform
              : undefined}
            scrollBlock
            showPixelIntensity
            normalizationData={props.normalizationData}
            keepPixelSelected={props.keepPixelSelected}
            {...{
              on: {
                move: handleImageMove,
                'pixel-select': handlePixelSelect,
              },
            }}
          />
          <ImageSaver
            class="absolute top-0 left-0 mt-3 ml-3 dom-to-image-hidden"
            domNode={viewerWrapper.$el}
            label={imageTitle}
            fileName={fileName}
          />
          <div class="flex absolute bottom-0 right-0 my-3 ml-3 dom-to-image-hidden">
            <FadeTransition>
              {
                showOpticalImage
                && nonEmptyAnnotations[0]?.dataset?.opticalImages[0]?.url
                !== undefined
                && <OpacitySettings
                  key="opticalOpacity"
                  label="Optical image visibility"
                  class="ds-comparison-opacity-item m-1 sm-leading-trim mt-auto dom-to-image-hidden"
                  opacity={imageSettings.opticalOpacity !== undefined
                    ? imageSettings.opticalOpacity : 1}
                  onOpacity={handleOpticalOpacityChange}
                />
              }
            </FadeTransition>
            <FadeTransition>
              {
                showOpticalImage
                && nonEmptyAnnotations[0]?.dataset?.opticalImages[0]?.url
                !== undefined
                && <OpacitySettings
                  key="opacity"
                  class="ds-comparison-opacity-item m-1 sm-leading-trim mt-auto dom-to-image-hidden"
                  opacity={imageSettings.annotImageOpacity !== undefined
                    ? imageSettings.annotImageOpacity : 1}
                  onOpacity={handleOpacityChange}
                />
              }
            </FadeTransition>
          </div>
          <FadeTransition class="absolute top-0 right-0 mt-3 ml-3 dom-to-image-hidden">
            {
              imageSettings.userScaling
              && <MultiChannelController
                style={{ display: !props.showChannels ? 'none' : '' }}
                showClippingNotice={!props.hideClipping && props.scaleType === 'linear'}
                menuItems={mode.value === 'MULTI' ? state.menuItems : state.menuItems.slice(0, 1)}
                mode={mode.value}
                activeLayer={$store.state.channels[$store.state.channels.length - 1]
              && $store.state.channels[$store.state.channels.length - 1].id === undefined}
                onToggleVisibility={toggleChannelVisibility}
                onChangeLayer={handleLayerColorChange}
                onRemoveLayer={handleRemoveLayer}
                onChange={handleUserScalingChange}
                onAddLayer={addLayer}
                onIntensityChange={handleIntensityChange}
                onIntensityLockChange={handleIntensityLockChangeForAll}
                isNormalized={props.isNormalized}
              />
            }
          </FadeTransition>
        </div>
      )
    }
  },
})
