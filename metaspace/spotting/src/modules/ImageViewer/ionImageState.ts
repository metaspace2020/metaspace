import { computed, reactive, ref, toRefs } from '@vue/composition-api'

import { channels as channelToRGB } from '../../lib/getColorScale'

import viewerState from './state'
import { OpacityMode } from '../../lib/createColormap'

export interface Annotation {
  id: string
  ion: string
  mz: number
  isotopeImages: { minIntensity: number, maxIntensity: number, url: string }[]
}

export interface IonImageState {
  maxIntensity: number
  minIntensity: number
  scaleRange: [number, number]
  popover: string | null
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

export interface IonImageLayer {
  id: string
  settings: IonImageLayerSettings
  multiModeState: IonImageState
  singleModeState: IonImageState
}

interface State {
  order: string[]
  activeLayer: string | null
}

interface Settings {
  lockMin: number | undefined
  lockMinScale: number
  lockMax: number | undefined
  lockMaxScale: number
  isLockActive: boolean
  opacity: number
  opticalOpacity: number
}

export type ImagePosition = {
  zoom: number
  xOffset: number
  yOffset: number
}

export type ImageSettings = {
  annotImageOpacity: number
  opacityMode: OpacityMode
  imagePosition: ImagePosition
  opticalSrc: string | null
  opticalTransform: number[][] | null
  pixelAspectRatio: number
  opticalOpacity: number
  // scaleType is deliberately not included here, because every time it changes some slow computation occurs,
  // and the computed getters were being triggered by any part of the ImageSettings object changing, such as opacity,
  // causing a lot of jank.
  // scaleType?: ScaleType
}

const channels = ['magenta', 'green', 'blue', 'red', 'yellow', 'cyan', 'orange', 'violet']

const state = reactive<State>({
  order: [],
  activeLayer: null,
})
const settings = reactive<Settings>({
  lockMin: undefined,
  lockMinScale: 0,
  lockMax: undefined,
  lockMaxScale: 1,
  isLockActive: true,
  opacity: 1,
  opticalOpacity: 1,
})
const activeAnnotation = ref<string>() // local copy of prop value to allow watcher to run

const annotationCache : Record<string, Annotation> = {}
const layerCache : Record<string, IonImageLayer> = {}

const orderedLayers = computed(() => state.order.map(id => layerCache[id]))

export const useIonImageLayers = () => ({
  layerCache,
  orderedLayers,
})

const lockedIntensities = computed(() => {
  if (settings.isLockActive) {
    return [settings.lockMin, settings.lockMax]
  }
  return []
})

const lockedScaleRange = computed(() => {
  const [min, max] = lockedIntensities.value
  return [
    min === undefined ? undefined : settings.lockMinScale,
    max === undefined ? undefined : settings.lockMaxScale,
  ]
})

export const useIonImageSettings = () => ({
  lockedIntensities,
  lockedScaleRange,
  settings,
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
  if (!annotation) {
    return { minIntensity: 0, maxIntensity: 1 }
  }
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
    popover: null,
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

  Object.assign(settings, {
    lockMin: undefined,
    lockMinScale: 0,
    lockMax: undefined,
    lockMaxScale: 1,
    isLockActive: true,
    opacity: 1,
    opticalOpacity: 1,
  })
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

function onAnnotationChange(annotation: Annotation) {
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
}

export const useAnnotations = () => ({
  activeAnnotation,
  annotationCache,
  onAnnotationChange,
  getImageIntensities,
})

export const useChannelSwatches = () => computed(() => {
  const swatches : Record<string, string> = {}
  if (viewerState.mode.value === 'MULTI') {
    for (const layer of orderedLayers.value) {
      swatches[layer.id] = channelToRGB[layer.settings.channel]
    }
  }
  return swatches
})

type Snapshot = {
  state: State
  settings: Settings
  layers: readonly IonImageLayer[]
}

type Export = {
  snapshot: Snapshot
  annotationIds: string[]
}

export const exportIonImageState = () : Export => {
  return {
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

export const restoreIonImageState = (imported: Import) => {
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
