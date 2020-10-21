import { ref, Ref, computed, reactive, watch, toRefs } from '@vue/composition-api'
import { Image } from 'upng-js'

import { loadPngFromUrl, processIonImage, renderScaleBar } from '../../lib/ionImageRendering'
import { IonImage, ColorMap, ScaleType } from '../../lib/ionImageRendering'
import createColorMap from '../../lib/createColormap'

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
  quantileRange: [number, number]
}

interface IonImageLayerSettings {
  channel: string
  label: string | undefined
  visible: boolean
}

interface ColorBar {
  img: string
  minColor: string
  maxColor: string
}

interface IonImageLayer {
  id: string
  annotation: Annotation
  colorBar: Ref<ColorBar>
  colorMap: Ref<ColorMap>
  image: Ref<IonImage | null>
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

const channels = ['red', 'green', 'blue', 'magenta', 'yellow', 'cyan', 'orange']

const activeAnnotation = ref<string>() // local copy of prop value to allow watcher to run
const state = reactive<State>({
  order: [],
  activeLayer: null,
  nextChannel: channels[0],
})
const ionImageLayerCache : Record<string, IonImageLayer> = {}

const activeSingleLayer = computed(() =>
  activeAnnotation.value ? ionImageLayerCache[activeAnnotation.value] : undefined,
)
const orderedLayers = computed(() => state.order.map(id => ionImageLayerCache[id]))
const visibleLayers = computed(() => orderedLayers.value.filter(layer =>
  layer.image.value !== null && layer.settings.visible,
))

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

function getInitialLayerState(annotation: Annotation): IonImageState {
  const [isotopeImage] = annotation.isotopeImages
  const { minIntensity = 0, maxIntensity = 1 } = isotopeImage || {}

  return {
    maxIntensity,
    minIntensity,
    quantileRange: [0, 1],
  }
}

function toRGBA(pixel: number[]) {
  const [r, g, b, a] = pixel
  return `rgba(${r},${g},${b},${(a / 255).toFixed(2)})`
}

export const useIonImages = (store: any) => {
  const ionImageLayers = computed(() => {
    if (viewerState.mode.value === 'SINGLE') {
      const layer = activeSingleLayer.value
      if (layer === undefined || layer.image.value === null) return []
      return [{
        ionImage: layer.image.value,
        colorMap: layer.colorMap.value,
      }]
    }
    const layers = []
    for (const { image, colorMap } of visibleLayers.value) {
      layers.push({
        ionImage: image.value,
        colorMap: colorMap.value,
      })
    }
    return layers
  })

  watch(() => store.state.annotation, (annotation) => {
    activeAnnotation.value = annotation.id

    if (viewerState.mode.value === 'SINGLE') {
      // TODO: make this cleaner
      for (const id of state.order) {
        const layer = ionImageLayerCache[id]
        const initialState = getInitialLayerState(layer.annotation)
        layer.multiModeState.minIntensity = initialState.minIntensity
        layer.multiModeState.maxIntensity = initialState.maxIntensity
        layer.multiModeState.quantileRange = initialState.quantileRange
        layer.settings.channel = channels[0]
        layer.settings.label = undefined
        layer.settings.visible = true
      }

      state.nextChannel = channels[1]
      if (annotation.id in ionImageLayerCache) {
        state.order = [annotation.id]
        state.activeLayer = annotation.id
        return
      } else {
        state.order = []
      }
    } else {
      if (state.order.includes(annotation.id)) {
        // state.activeLayer = annotation.id
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

    const singleModeState = reactive(getInitialLayerState(annotation))
    const multiModeState = reactive(getInitialLayerState(annotation))

    const activeState = computed(() =>
      viewerState.mode.value === 'SINGLE' ? singleModeState : multiModeState,
    )

    const settings = reactive({
      channel,
      label: undefined,
      visible: true,
    })

    const raw = ref<Image | null>(null)

    const image = computed(() => {
      const { quantileRange, minIntensity, maxIntensity } = activeState.value
      if (raw.value !== null) {
        return processIonImage(
          raw.value,
          minIntensity,
          maxIntensity,
          store.getters.settings.annotationView.scaleType,
          quantileRange,
        )
      }
      return null
    })

    const activeColorMap = computed(() => viewerState.mode.value === 'SINGLE'
      ? store.getters.settings.annotationView.colormap as string
      : settings.channel,
    )

    ionImageLayerCache[annotation.id] = {
      annotation: annotation,
      id: annotation.id,
      settings,
      singleModeState,
      multiModeState,
      image,
      colorMap: computed(() => {
        // const { opacityMode, annotImageOpacity } = props.imageLoaderSettings
        // return createColorMap(activeColorMap.value, opacityMode, annotImageOpacity)
        return createColorMap(activeColorMap.value)
      }),
      colorBar: computed(() => {
        const colorMap = createColorMap(activeColorMap.value)
        return {
          img: image.value ? renderScaleBar(image.value, colorMap, true) : '',
          minColor: toRGBA(colorMap[0]),
          maxColor: toRGBA(colorMap[255]),
        }
      }),
    }

    const [isotopeImage] = annotation.isotopeImages
    if (isotopeImage) {
      loadPngFromUrl(isotopeImage.url)
        .then(img => {
          raw.value = img
        })
    }
  })

  return {
    ionImageLayers,
  }
}

export const useIonImageMenu = () => {
  const { activeLayer } = toRefs(state)

  const singleModeMenuItem = computed(() => {
    const layer = activeSingleLayer.value
    if (layer) {
      return {
        state: layer.singleModeState,
        colorBar: layer.colorBar.value,
        updateIntensity(range: [number, number]) {
          layer.singleModeState.quantileRange = range
        },
      }
    }
    return null
  })

  const multiModeMenuItems = computed(() =>
    orderedLayers.value.map(layer => {
      return {
        id: layer.id,
        annotation: layer.annotation,
        state: layer.multiModeState,
        settings: layer.settings,
        colorBar: layer.colorBar.value,
        updateIntensity(range: [number, number]) {
          layer.multiModeState.quantileRange = range
        },
        toggleVisibility() {
          const { settings } = layer
          settings.visible = !settings.visible
        },
      }
    }),
  )

  return {
    multiModeMenuItems,
    singleModeMenuItem,
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
