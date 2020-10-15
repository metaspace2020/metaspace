import { ref, Ref, computed, reactive, watch, toRefs } from '@vue/composition-api'
import { Image } from 'upng-js'

import { loadPngFromUrl, processIonImage } from '../../lib/ionImageRendering'
import { IonImage, ColorMap, ScaleType } from '../../lib/ionImageRendering'
import createColorMap from '../../lib/createColormap'
import getColorScale from '../../lib/getColorScale'

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
  background: string
  minColor?: string
  maxColor?: string
}

interface IonImageLayer {
  id: string
  annotation: Annotation
  colorBar: Ref<ColorBar>
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

function createState(annotation: Annotation) {
  const [isotopeImage] = annotation.isotopeImages
  const { minIntensity = 0, maxIntensity = 1 } = isotopeImage || {}

  return reactive<IonImageState>({
    maxIntensity,
    minIntensity,
    quantileRange: [0, 1],
  })
}

export const useIonImages = (props: Props) => {
  const ionImageLayers = computed(() => {
    const { opacityMode, annotImageOpacity } = props.imageLoaderSettings

    if (viewerState.mode.value === 'SINGLE') {
      const layer = activeSingleLayer.value
      if (layer === undefined || layer.image.value === null) return []
      const colorMap = createColorMap(props.colormap, opacityMode, annotImageOpacity)
      return [{ ionImage: layer.image.value, colorMap }]
    }

    const layers = []
    const colormaps: Record<string, ColorMap> = {}
    for (const { image, settings } of visibleLayers.value) {
      if (!(settings.channel in colormaps)) {
        const { opacityMode, annotImageOpacity } = props.imageLoaderSettings
        colormaps[settings.channel] = createColorMap(
          settings.channel,
          opacityMode,
          annotImageOpacity,
        )
      }
      layers.push({
        ionImage: image.value,
        colorMap: colormaps[settings.channel],
      })
    }
    return layers
  })

  watch(() => props.annotation, (annotation) => {
    activeAnnotation.value = annotation.id

    if (viewerState.mode.value === 'SINGLE' && annotation.id in ionImageLayerCache) {
      return
    }

    if (state.order.includes(annotation.id)) {
      state.activeLayer = annotation.id
      return
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

    const singleModeState = createState(props.annotation)
    const multiModeState = createState(props.annotation)

    const activeState = computed(() =>
      viewerState.mode.value === 'SINGLE' ? singleModeState : multiModeState,
    )

    const settings = reactive({
      channel,
      label: undefined,
      visible: true,
    })

    const raw = ref<Image | null>(null)

    ionImageLayerCache[annotation.id] = {
      annotation: props.annotation,
      id: props.annotation.id,
      settings,
      singleModeState,
      multiModeState,
      image: computed(() => {
        const { quantileRange, minIntensity, maxIntensity } = activeState.value
        if (raw.value !== null) {
          return processIonImage(
            raw.value,
            minIntensity,
            maxIntensity,
            props.scaleType,
            quantileRange,
          )
        }
        return null
      }),
      colorBar: computed(() => {
        const { quantileRange } = activeState.value
        const { domain, range } = getColorScale(
          viewerState.mode.value === 'SINGLE' ? props.colormap : settings.channel,
        )
        const [minQuantile, maxQuantile] = quantileRange
        const colors = []
        if (minQuantile > 0) {
          colors.push(`${range[0]} 0%`)
        }
        for (let i = 0; i < domain.length; i++) {
          const pct = (minQuantile + (domain[i] * (maxQuantile - minQuantile))) * 100
          colors.push(range[i] + ' ' + (pct + '%'))
        }
        const background = `background-image: linear-gradient(to right, ${colors.join(', ')})`
        return {
          background,
          minColor: range[0],
          maxColor: range[range.length - 1],
        }
      }),
    }

    const [isotopeImage] = props.annotation.isotopeImages
    if (isotopeImage) {
      loadPngFromUrl(isotopeImage.url)
        .then(img => {
          raw.value = img
        })
    }
  })

  watch(viewerState.mode, (mode) => {
    if (mode === 'SINGLE') {
      const { id } = props.annotation

      // TODO: make this cleaner

      for (const layer of Object.values(ionImageLayerCache)) {
        layer.multiModeState = createState(layer.annotation)
        if (layer.id === id) {
          layer.settings.channel = channels[0]
          layer.settings.label = undefined
          layer.settings.visible = true
        }
      }

      state.order = [id]
      state.activeLayer = id
      state.nextChannel = channels[1]
    }
  })

  return {
    ionImageLayers,
  }
}

export const useIonImageMenu = (props: { annotationId: string }) => {
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
    orderedLayers.value.map(layer => ({
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
    })),
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
