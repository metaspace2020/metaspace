import { ref, Ref, computed, reactive, watch, onBeforeUnmount, toRefs } from '@vue/composition-api'
import { Image } from 'upng-js'

import { loadPngFromUrl, processIonImage } from '../../lib/ionImageRendering'
import { IonImage, ColorMap, ScaleType } from '../../lib/ionImageRendering'
import createColorMap from '../../lib/createColormap'
import getColorScale from '../../lib/getColorScale'

interface Annotation {
  id: string
  ion: string
  mz: number
  isotopeImages: { minIntensity: number, maxIntensity: number, url: string }[]
}

interface IonImageLayerState {
  annotation: Annotation
  channel: string
  id: string
  quantileRange: [number, number]
  label: string | undefined
  minIntensity: number
  maxIntensity: number
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
  state: IonImageLayerState
}

interface State {
  order: string[]
  activeLayer: string | null
  // mode: 'colormap' | 'channel'
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
  // mode: 'colormap',
  nextChannel: channels[0],
}

const ionImageState = reactive<State>(initialState)
const ionImageLayerCache : Record<string, IonImageLayer> = {}

const orderedIonImageLayers = computed(() => ionImageState.order.map(id => ionImageLayerCache[id]))

const ionImageMenuItems = computed(() => {
  return orderedIonImageLayers.value.map(({ state, colorBar }) => ({
    colorBar: colorBar.value,
    layer: state,
  }))
})

const mode = computed(() => ionImageState.order.length > 1 ? 'channel' : 'colormap')

function deleteLayer(id: string) : number {
  delete ionImageLayerCache[id]

  const idx = ionImageState.order.indexOf(id)
  ionImageState.order.splice(idx, 1)
  if (idx in ionImageState.order) {
    ionImageState.activeLayer = ionImageState.order[idx]
  } else {
    ionImageState.activeLayer = null
  }
  return idx
}

export const useIonImages = (props: Props) => {
  const ionImageLayers = computed(() => {
    const layers = []
    const colormaps: Record<string, ColorMap> = {}
    for (const { image, state } of orderedIonImageLayers.value) {
      if (image.value == null || !state.visible) {
        continue
      }
      const key = mode.value === 'colormap' ? props.colormap : state.channel
      if (!(key in colormaps)) {
        const { opacityMode, annotImageOpacity } = props.imageLoaderSettings
        colormaps[key] = createColorMap(key, opacityMode, annotImageOpacity)
      }
      layers.push({
        ionImage: image.value,
        colorMap: colormaps[key],
      })
    }
    return layers
  })

  watch(() => props.annotation, () => {
    const { id } = props.annotation

    if (id in ionImageLayerCache) {
      ionImageState.activeLayer = id
      return
    }

    const [isotopeImage] = props.annotation.isotopeImages
    const { minIntensity = 0, maxIntensity = 1 } = isotopeImage || {}

    let channel
    if (ionImageState.activeLayer !== null) {
      channel = ionImageLayerCache[ionImageState.activeLayer].state.channel
      const idx = deleteLayer(ionImageState.activeLayer)
      ionImageState.order.splice(idx, 0, id)
    } else {
      ionImageState.order.push(id)
      channel = ionImageState.nextChannel
      ionImageState.nextChannel = channels[channels.indexOf(channel) + 1] || channels[0]
    }

    const state = reactive<IonImageLayerState>({
      annotation: props.annotation,
      channel,
      id,
      label: undefined,
      maxIntensity,
      minIntensity,
      quantileRange: [0, 1],
      visible: true,
    })

    const raw = ref<Image | null>(null)
    const layer = {
      state,
      image: computed(() => {
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
      }),
      colorBar: computed(() => {
        const { channel, quantileRange } = state
        const mapOrChannel = mode.value === 'colormap' ? props.colormap : channel
        const { domain, range } = getColorScale(mapOrChannel)
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
      }),
    }

    ionImageLayerCache[id] = layer
    ionImageState.activeLayer = id

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
  return {
    menuItems: ionImageMenuItems,
    activeLayer,
    setActiveLayer(id: string) {
      ionImageState.activeLayer = id
    },
    updateIntensity(id: string, range: [number, number]) {
      if (id in ionImageLayerCache) {
        const { state } = ionImageLayerCache[id]
        state.quantileRange = range
      }
    },
    toggleVisibility(id: string) {
      if (id in ionImageLayerCache) {
        const { state } = ionImageLayerCache[id]
        state.visible = !state.visible
      }
    },
    deleteLayer(id: string) {
      if (ionImageState.order.length > 1) {
        deleteLayer(id)
      }
    },
  }
}
