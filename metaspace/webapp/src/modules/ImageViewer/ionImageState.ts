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
  clipped: number
  image: number
  scaled: number
  quantile: number
  user: number
  status: 'LOCKED' | 'CLIPPED' | undefined
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
  settings: IonImageLayerSettings
  multiModeState: IonImageState
  singleModeState: IonImageState
}

interface State {
  order: string[]
  activeLayer: string | null
}

interface Props {
  annotation: Annotation,
  imageLoaderSettings: any
  colormap: string
  scaleType?: ScaleType
}

interface Settings {
  lockMin: number | undefined
  lockMax: number | undefined
  isLockActive: boolean
  imageSize: {
    width: number
    height: number
  } | null
}

const channels = ['red', 'green', 'blue', 'magenta', 'yellow', 'cyan', 'orange']

const activeAnnotation = ref<string>() // local copy of prop value to allow watcher to run
const state = reactive<State>({
  order: [],
  activeLayer: null,
})
const settings = reactive<Settings>({
  lockMin: undefined,
  lockMax: undefined,
  isLockActive: true,
  imageSize: null,
})

const annotationCache : Record<string, Annotation> = {}
const layerCache : Record<string, IonImageLayer> = {}
const rawImageCache : Record<string, Ref<Image | null>> = {}

const orderedLayers = computed(() => state.order.map(id => layerCache[id]))

const lockedIntensities = computed(() => {
  if (settings.isLockActive) {
    return [settings.lockMin, settings.lockMax]
  }
  return []
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

function getIntensityData(
  image: number, clipped: number, scaled: number, user: number, quantile: number, isLocked?: boolean,
) {
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

function createComputedImageData(props: Props, layer: IonImageLayer) {
  if (!(layer.id in rawImageCache)) {
    rawImageCache[layer.id] = ref<Image | null>(null)
  }

  if (rawImageCache[layer.id].value === null) {
    const annotation = annotationCache[layer.id]
    const [isotopeImage] = annotation.isotopeImages
    if (isotopeImage) {
      loadPngFromUrl(isotopeImage.url)
        .then(img => {
          rawImageCache[layer.id].value = img

          if (settings.imageSize === null) {
            settings.imageSize = {
              width: img.width,
              height: img.height,
            }
          }
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
      const annotation = annotationCache[layer.id]
      const { minIntensity, maxIntensity } = getImageIntensities(annotation)
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
        scaledMinIntensity, scaledMaxIntensity,
        userMinIntensity, userMaxIntensity,
        lowQuantile, highQuantile,
      } = image.value || {}
      const [lockedMin, lockedMax] = lockedIntensities.value
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
    const annotation = annotationCache[id]
    const layer = layerCache[id]
    const initialState = getInitialLayerState(annotation)
    layer.multiModeState.minIntensity = initialState.minIntensity
    layer.multiModeState.maxIntensity = initialState.maxIntensity
    layer.multiModeState.scaleRange = initialState.scaleRange
    layer.settings.channel = channels[0]
    layer.settings.label = undefined
    layer.settings.visible = true
  }
  state.activeLayer = null
  state.order = []
}

export function resetIonImageState() {
  resetChannelsState()

  settings.lockMin = undefined
  settings.lockMax = undefined
  settings.isLockActive = true
  settings.imageSize = null
}

export const useIonImages = (props: Props) => {
  const ionImagesWithData = computed(() => {
    const memo = []
    if (viewerState.mode.value === 'SINGLE') {
      const layer = activeAnnotation.value ? layerCache[activeAnnotation.value] : null
      if (layer) {
        memo.push({
          layer,
          data: createComputedImageData(props, layer),
        })
      }
    } else {
      for (const layer of orderedLayers.value) {
        memo.push({
          layer,
          data: createComputedImageData(props, layer),
        })
      }
    }
    return memo
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
        annotation: annotationCache[layer.id],
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

  const ionImageDimensions = computed(() => {
    if (settings.imageSize !== null) {
      return settings.imageSize
    }
    return { width: undefined, height: undefined }
  })

  watch(() => props.annotation, (annotation) => {
    activeAnnotation.value = annotation.id

    if (viewerState.mode.value === 'SINGLE') {
      resetChannelsState()
      if (annotation.id in layerCache) {
        state.order = [annotation.id]
        state.activeLayer = annotation.id
        return
      }
    } else {
      if (state.order.includes(annotation.id)) {
        return
      }
    }

    let channel = channels[0]
    if (state.activeLayer !== null) {
      channel = layerCache[state.activeLayer].settings.channel
      const idx = removeLayer(state.activeLayer)
      state.order.splice(idx, 0, annotation.id)
    } else {
      const usedChannels = orderedLayers.value.map(layer => layer.settings.channel)
      const unusedChannels = channels.filter(c => !(usedChannels.includes(c)))
      if (unusedChannels.length) {
        channel = unusedChannels[0]
        // channel = unusedChannels[Math.floor(Math.random() * (unusedChannels.length - 1))]
      }
      state.order.push(annotation.id)
    }
    state.activeLayer = annotation.id

    annotationCache[annotation.id] = annotation

    layerCache[annotation.id] = {
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
    ionImageDimensions,
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

type Snapshot = {
  state: State
  settings: Settings
  layers: readonly IonImageLayer[]
}

type Export = {
  version: number
  snapshot: Snapshot
  annotationIds: string[]
}

export const exportIonImageState = () : Export => {
  return {
    version: 1,
    snapshot: {
      state,
      settings,
      layers: orderedLayers.value,
    },
    annotationIds: state.order,
  }
}

type Import = {
  version: number
  snapshot: Snapshot,
  annotations: Annotation[]
}

export const importIonImageState = (imported: Import) => {
  resetIonImageState()

  Object.assign(state, imported.snapshot.state)
  Object.assign(settings, imported.snapshot.settings)

  for (const annotation of imported.annotations) {
    annotationCache[annotation.id] = annotation
  }

  for (const layer of imported.snapshot.layers) {
    layerCache[layer.id] = {
      id: layer.id,
      singleModeState: reactive(layer.singleModeState),
      multiModeState: reactive(layer.multiModeState),
      settings: reactive(layer.settings),
    }
  }
}

// @ts-ignore
// window.__export = exportIonImageState
// @ts-ignore
// window.__import = importIonImageState
