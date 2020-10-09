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
  id: string
  annotation: Annotation
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
  minColor: string
  maxColor: string
}

interface IonImageLayer {
  colorBar: Ref<ColorBar>
  image: Ref<IonImage | null>
  state: IonImageState
}

interface MultiIonImageLayer extends IonImageLayer {
  settings: IonImageLayerSettings
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

const initialState = {
  order: [],
  activeLayer: null,
  nextChannel: channels[0],
}

const ionImageState = reactive<State>(initialState)
const multiModeLayers : Record<string, MultiIonImageLayer> = {}
let singleModeLayer : IonImageLayer

const orderedIonImageLayers = computed(() => ionImageState.order.map(id => multiModeLayers[id]))

function deleteLayer(id: string) : number {
  delete multiModeLayers[id]

  const idx = ionImageState.order.indexOf(id)
  ionImageState.order.splice(idx, 1)
  if (idx in ionImageState.order) {
    ionImageState.activeLayer = ionImageState.order[idx]
  } else {
    ionImageState.activeLayer = null
  }
  return idx
}

function createState(annotation: Annotation) {
  const [isotopeImage] = annotation.isotopeImages
  const { minIntensity = 0, maxIntensity = 1 } = isotopeImage || {}

  return reactive<IonImageState>({
    id: annotation.id,
    annotation,
    maxIntensity,
    minIntensity,
    quantileRange: [0, 1],
  })
}

function createComputedImage(state: IonImageState, raw: Ref<Image | null>, props: Props) {
  return computed(() => {
    const { quantileRange, minIntensity, maxIntensity } = state
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
  })
}

function createColorBar(state: IonImageState, getMapOrChannel: () => string) {
  return computed(() => {
    const { quantileRange } = state
    const { domain, range } = getColorScale(getMapOrChannel())
    const [minQuantile, maxQuantile] = quantileRange
    const colors = []
    if (minQuantile > 0) {
      colors.push(`${range[0]} 0%`)
    }
    for (let i = 0; i < domain.length; i++) {
      const pct = (minQuantile + (domain[i] * (maxQuantile - minQuantile))) * 100
      colors.push(range[i] + ' ' + (pct + '%'))
    }
    return {
      background: `background-image: linear-gradient(to right, ${colors.join(', ')})`,
      minColor: range[0],
      maxColor: range[range.length - 1],
    }
  })
}

export const useIonImages = (props: Props) => {
  const ionImageLayers = computed(() => {
    const { opacityMode, annotImageOpacity } = props.imageLoaderSettings

    if (viewerState.mode.value === 'SINGLE') {
      if (singleModeLayer.image.value === null) return []

      const { image } = singleModeLayer
      const colorMap = createColorMap(props.colormap, opacityMode, annotImageOpacity)
      return [{ ionImage: image.value, colorMap }]
    }

    const layers = []
    const colormaps: Record<string, ColorMap> = {}
    for (const { image, settings } of orderedIonImageLayers.value) {
      if (image.value == null || !settings?.visible) {
        continue
      }
      if (!(settings.channel in colormaps)) {
        const { opacityMode, annotImageOpacity } = props.imageLoaderSettings
        colormaps[settings.channel] = createColorMap(settings.channel, opacityMode, annotImageOpacity)
      }
      layers.push({
        ionImage: image.value,
        colorMap: colormaps[settings.channel],
      })
    }
    return layers
  })

  watch(() => props.annotation, () => {
    const raw = ref<Image | null>(null)

    const singleModeState = createState(props.annotation)
    singleModeLayer = {
      state: singleModeState,
      image: createComputedImage(singleModeState, raw, props),
      colorBar: createColorBar(singleModeState, () => props.colormap),
    }

    const { id } = props.annotation

    if (id in multiModeLayers) {
      ionImageState.activeLayer = id
      return
    }

    const state = createState(props.annotation)

    let channel = channels[0]
    if (ionImageState.activeLayer !== null) {
      channel = multiModeLayers[ionImageState.activeLayer].settings?.channel
      const idx = deleteLayer(ionImageState.activeLayer)
      ionImageState.order.splice(idx, 0, id)
    } else {
      ionImageState.order.push(id)
      channel = ionImageState.nextChannel
      ionImageState.nextChannel = channels[channels.indexOf(channel) + 1] || channels[0]
    }

    const settings = reactive({
      channel,
      label: undefined,
      visible: true,
    })

    const layer = {
      annotation: props.annotation,
      id: props.annotation.id,
      image: createComputedImage(state, raw, props),
      state,
      settings,
      colorBar: createColorBar(state, () => settings.channel),
    }

    multiModeLayers[id] = layer
    ionImageState.activeLayer = id

    const [isotopeImage] = props.annotation.isotopeImages
    if (isotopeImage) {
      loadPngFromUrl(isotopeImage.url)
        .then(img => {
          raw.value = img
        })
    }
  })

  // onBeforeUnmount(() => {
  //   ionImageState.order = []
  //   ionImageState.activeLayer = null
  //   ionImageLayerCache = {}
  // })

  return {
    ionImageLayers,
  }
}

export const useIonImageMenu = () => {
  const { activeLayer } = toRefs(ionImageState)

  const singleModeMenuItem = computed(() => {
    return {
      state: singleModeLayer.state,
      colorBar: singleModeLayer.colorBar.value,
    }
  })

  const multiModeMenuItems = computed(() =>
    orderedIonImageLayers.value.map(layer => ({
      state: layer.state,
      settings: layer.settings,
      colorBar: layer.colorBar.value,
    })),
  )

  return {
    multiModeMenuItems,
    singleModeMenuItem,
    activeLayer,
    setActiveLayer(id: string | null) {
      ionImageState.activeLayer = id
    },
    updateSingleModeIntensity(range: [number, number]) {
      if (singleModeLayer) {
        singleModeLayer.state.quantileRange = range
      }
    },
    updateLayerIntensity(range: [number, number], id: string) {
      if (id in multiModeLayers) {
        const { state } = multiModeLayers[id]
        state.quantileRange = range
      }
    },
    toggleVisibility(id: string) {
      if (id in multiModeLayers) {
        const { settings } = multiModeLayers[id]
        settings.visible = !settings.visible
      }
    },
    deleteLayer(id: string) {
      if (ionImageState.order.length > 1) {
        deleteLayer(id)
      }
    },
  }
}
