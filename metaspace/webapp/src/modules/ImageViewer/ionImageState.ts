import { ref, Ref, computed, reactive, watch, toRefs } from '@vue/composition-api'
import { Image } from 'upng-js'

import { loadPngFromUrl, processIonImage, renderScaleBar } from '../../lib/ionImageRendering'
import { ScaleType } from '../../lib/ionImageRendering'
import createColorMap from '../../lib/createColormap'
import getColorScale, { channels as channelToRGB } from '../../lib/getColorScale'
import reportError from '../../lib/reportError'

import viewerState from './state'

interface Annotation {
  id: string
  ion: string
  mz: number
  isotopeImages: { minIntensity: number, maxIntensity: number, url: string }[]
}

export interface IonImageState {
  maxIntensity: number
  minIntensity: number
  scaleRange: [number, number]
}

export interface IonImageIntensity {
  clippedMin: number
  clippedMax: number
  imageMin: number
  imageMax: number
  scaledMin: number
  scaledMax: number
  lowQuantile: number
  highQuantile: number
  isMinClipped: boolean
  isMaxClipped: boolean
  isMinLocked: boolean
  isMaxLocked: boolean
}

export interface ColorBar {
  gradient: string
  minColor: string
  maxColor: string
}

interface IonImageLayerSettings {
  channel: string
  label: string | undefined
  visible: boolean
}

interface IonImageLayer {
  id: string
  annotation: Annotation
  settings: IonImageLayerSettings
  multiModeState: IonImageState
  singleModeState: IonImageState
}

interface State {
  order: string[]
  activeLayer: string | null
  nextChannel: string
}

interface Props {
  annotation: Annotation,
  imageLoaderSettings: any
  colormap: string
  scaleType?: ScaleType
}

interface Settings {
  lockMin: string
  lockMax: string
  isLockActive: boolean
}

const channels = ['red', 'green', 'blue', 'magenta', 'yellow', 'cyan', 'orange']

const activeAnnotation = ref<string>() // local copy of prop value to allow watcher to run
const state = reactive<State>({
  order: [],
  activeLayer: null,
  nextChannel: channels[0],
})
const settings = reactive<Settings>({
  lockMin: '',
  lockMax: '',
  isLockActive: true,
})
const ionImageLayerCache : Record<string, IonImageLayer> = {}
const rawImageCache : Record<string, Ref<Image | null>> = {}

const orderedLayers = computed(() => state.order.map(id => ionImageLayerCache[id]))

const lockedIntensities = computed(() => {
  if (settings.isLockActive) {
    const minF = parseFloat(settings.lockMin)
    const maxF = parseFloat(settings.lockMax)
    return [
      isNaN(minF) ? undefined : minF,
      isNaN(maxF) ? undefined : maxF,
    ]
  }
  return []
})

const hasLockedIntensities = computed(() => {
  const [lockedMin, lockedMax] = lockedIntensities.value
  return lockedMin !== undefined || lockedMax !== undefined
})

function removeLayer(id: string) : number {
  const idx = state.order.indexOf(id)
  state.order.splice(idx, 1)
  if (idx in state.order) {
    state.activeLayer = state.order[idx]
  } else {
    state.activeLayer = null
  }
  return idx
}

function getImageIntensities(annotation: Annotation) {
  const [isotopeImage] = annotation.isotopeImages
  const { minIntensity = 0, maxIntensity = 1 } = isotopeImage || {}
  return {
    minIntensity,
    maxIntensity,
  }
}

function getInitialLayerState(annotation: Annotation): IonImageState {
  const { minIntensity, maxIntensity } = getImageIntensities(annotation)

  return {
    maxIntensity,
    minIntensity,
    scaleRange: [0, 1],
  }
}

function createComputedImageData(props: Props, layer: IonImageLayer) {
  if (!(layer.id in rawImageCache)) {
    rawImageCache[layer.id] = ref<Image | null>(null)
  }

  if (rawImageCache[layer.id].value === null) {
    const [isotopeImage] = layer.annotation.isotopeImages
    if (isotopeImage) {
      loadPngFromUrl(isotopeImage.url)
        .then(img => {
          rawImageCache[layer.id].value = img
        })
        .catch(err => {
          reportError(err, null)
        })
    }
  }

  const activeState = computed(() =>
    viewerState.mode.value === 'SINGLE' ? layer.singleModeState : layer.multiModeState,
  )

  const userIntensities = computed(() => {
    const { minIntensity, maxIntensity } = activeState.value
    const [min = minIntensity, max = maxIntensity] = lockedIntensities.value
    return [min, max] as [number, number]
  })

  const image = computed(() => {
    const raw = rawImageCache[layer.id]
    if (raw.value !== null) {
      const { minIntensity, maxIntensity } = getImageIntensities(layer.annotation)
      return processIonImage(
        raw.value,
        minIntensity,
        maxIntensity,
        props.scaleType,
        activeState.value.scaleRange,
        userIntensities.value,
      )
    }
    return null
  })

  const activeColorMap = computed(() => viewerState.mode.value === 'SINGLE'
    ? props.colormap as string
    : layer.settings.channel,
  )

  const colorMap = computed(() => {
    const { opacityMode, annotImageOpacity } = props.imageLoaderSettings
    return createColorMap(activeColorMap.value, opacityMode, annotImageOpacity)
  })

  const colorBar = computed(() => {
    const colorMap = createColorMap(activeColorMap.value)
    const { range } = getColorScale(activeColorMap.value)
    const { scaledMinIntensity, scaledMaxIntensity } = image.value || {}
    return {
      minColor: range[0],
      maxColor: range[range.length - 1],
      gradient: scaledMinIntensity === scaledMaxIntensity
        ? `linear-gradient(to right, ${range.join(',')})`
        : image.value ? `url(${renderScaleBar(image.value, colorMap, true)})` : '',
    }
  })

  const intensity = computed(() => {
    if (image.value !== null) {
      const {
        minIntensity, maxIntensity,
        clippedMinIntensity, clippedMaxIntensity,
        lowQuantile, highQuantile,
        scaledMinIntensity, scaledMaxIntensity,
      } = image.value || {}
      const [lockedMin, lockedMax] = lockedIntensities.value
      return {
        lowQuantile,
        highQuantile,
        isMinClipped: !hasLockedIntensities.value && lowQuantile > 0,
        isMaxClipped: !hasLockedIntensities.value && highQuantile < 1,
        isMinLocked: lockedMin !== undefined,
        isMaxLocked: lockedMax !== undefined,
        imageMin: minIntensity,
        imageMax: maxIntensity,
        clippedMin: clippedMinIntensity,
        clippedMax: clippedMaxIntensity,
        scaledMin: scaledMinIntensity,
        scaledMax: scaledMaxIntensity,
      }
    }
    return null
  })

  return {
    colorBar,
    colorMap,
    image,
    intensity,
  }
}

function resetChannelsState() {
  // TODO: how to make this cleaner?
  for (const id of state.order) {
    const layer = ionImageLayerCache[id]
    const initialState = getInitialLayerState(layer.annotation)
    layer.multiModeState.minIntensity = initialState.minIntensity
    layer.multiModeState.maxIntensity = initialState.maxIntensity
    layer.multiModeState.scaleRange = initialState.scaleRange
    layer.settings.channel = channels[0]
    layer.settings.label = undefined
    layer.settings.visible = true
  }
  state.nextChannel = channels[0]
  state.activeLayer = null
  state.order = []
}

export function resetIonImageState() {
  resetChannelsState()

  settings.lockMin = ''
  settings.lockMax = ''
  settings.isLockActive = true
}

export const useIonImages = (props: Props) => {
  const ionImagesWithData = computed(() => {
    const data = []
    if (viewerState.mode.value === 'SINGLE') {
      const layer = activeAnnotation.value ? ionImageLayerCache[activeAnnotation.value] : null
      if (layer) {
        data.push({
          layer,
          data: createComputedImageData(props, layer),
        })
      }
    } else {
      for (const layer of orderedLayers.value) {
        data.push({
          layer,
          data: createComputedImageData(props, layer),
        })
      }
    }
    return data
  })

  const ionImagesLoading = computed(() => {
    for (const { data } of ionImagesWithData.value) {
      if (data.image.value === null) return true
    }
    return false
  })

  const ionImageLayers = computed(() => {
    if (viewerState.mode.value === 'SINGLE') {
      if (ionImagesWithData.value.length) {
        const { image, colorMap } = ionImagesWithData.value[0].data
        if (image.value !== null) {
          return [{
            ionImage: image.value,
            colorMap: colorMap.value,
          }]
        }
      }
      return []
    }

    const layers = []
    for (const { layer, data } of ionImagesWithData.value) {
      const { image, colorMap } = data
      if (image.value !== null && layer.settings.visible) {
        layers.push({
          ionImage: image.value,
          colorMap: colorMap.value,
        })
      }
    }
    return layers
  })

  const singleIonImageControls = computed(() => {
    if (ionImagesWithData.value.length) {
      const { layer, data } = ionImagesWithData.value[0]
      return {
        colorBar: data.colorBar,
        intensity: data.intensity,
        state: layer.singleModeState,
        updateIntensity(range: [number, number]) {
          layer.singleModeState.scaleRange = range
        },
      }
    }
    return null
  })

  const ionImageMenuItems = computed(() => {
    const items = []
    for (const { layer, data } of ionImagesWithData.value) {
      items.push({
        loading: data.image.value === null,
        annotation: layer.annotation,
        colorBar: data.colorBar,
        id: layer.id,
        intensity: data.intensity,
        settings: layer.settings,
        state: layer.multiModeState,
        updateIntensity(range: [number, number]) {
          layer.multiModeState.scaleRange = range
        },
        toggleVisibility() {
          const { settings } = layer
          settings.visible = !settings.visible
        },
      })
    }
    return items
  })

  watch(() => props.annotation, (annotation) => {
    activeAnnotation.value = annotation.id

    if (viewerState.mode.value === 'SINGLE') {
      resetChannelsState()
      if (annotation.id in ionImageLayerCache) {
        state.order = [annotation.id]
        state.activeLayer = annotation.id
        state.nextChannel = channels[1]
        return
      }
    } else {
      if (state.order.includes(annotation.id)) {
        return
      }
    }

    let channel = channels[0]
    if (state.activeLayer !== null) {
      channel = ionImageLayerCache[state.activeLayer].settings?.channel
      const idx = removeLayer(state.activeLayer)
      state.order.splice(idx, 0, annotation.id)
    } else {
      state.order.push(annotation.id)
      channel = state.nextChannel
      state.nextChannel = channels[channels.indexOf(channel) + 1] || channels[0]
    }
    state.activeLayer = annotation.id

    ionImageLayerCache[annotation.id] = {
      annotation: annotation,
      id: annotation.id,
      settings: reactive({
        channel,
        label: undefined,
        visible: true,
      }),
      singleModeState: reactive(getInitialLayerState(annotation)),
      multiModeState: reactive(getInitialLayerState(annotation)),
    }
  })

  return {
    ionImageLayers,
    ionImageMenuItems,
    singleIonImageControls,
    ionImagesLoading,
  }
}

export const useIonImageMenu = () => {
  const { activeLayer } = toRefs(state)

  return {
    activeLayer,
    setActiveLayer(id: string | null) {
      state.activeLayer = id
    },
    removeLayer(id: string) {
      if (state.order.length > 1) {
        removeLayer(id)
      }
    },
  }
}

export const useChannelSwatches = () => computed(() => {
  const swatches : Record<string, string> = {}
  if (viewerState.mode.value === 'MULTI') {
    for (const layer of orderedLayers.value) {
      swatches[layer.id] = channelToRGB[layer.settings.channel]
    }
  }
  return swatches
})

export const useIonImageSettings = () => ({
  lockedIntensities,
  settings,
})
