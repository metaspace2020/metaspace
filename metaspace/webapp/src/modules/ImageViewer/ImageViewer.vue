<template>
  <div
    class="relative"
  >
    <fade-transition>
      <ion-image-menu
        v-if="openMenu === 'ION'"
        key="ION"
        :items="ionImageMenuItems"
        :active-layer="ionImageState.activeLayer"
        @range="updateIntensity"
        @visible="toggleVisibility"
        @active="id => ionImageState.activeLayer = id"
        @delete="deleteLayer"
      />
      <!-- <optical-image-menu
        v-if="openMenu === 'OPTICAL'"
        key="OPTICAL"
      /> -->
    </fade-transition>
    <div
      ref="imageArea"
      v-resize="onResize"
      class="relative"
    >
      <ion-image-viewer
        :annotation="annotation"
        :height="dimensions.height"
        :ion-image-layers="ionImageLayers"
        :max-zoom="imageFit.imageZoom * 20"
        :min-zoom="imageFit.imageZoom / 4"
        :opacity="opacity"
        :pixel-size-x="pixelSizeX"
        :pixel-size-y="pixelSizeY"
        :scale-bar-color="scaleBarColor"
        :scale-type="scaleType"
        :width="dimensions.width"
        :x-offset="imageLoaderSettings.imagePosition.xOffset"
        :y-offset="imageLoaderSettings.imagePosition.yOffset"
        :zoom="imageLoaderSettings.imagePosition.zoom * imageFit.imageZoom"
        scroll-block
        show-pixel-intensity
        v-bind="imageLoaderSettings"
        @move="handleImageMove"
      />
      <image-saver
        class="absolute top-0 left-0 mt-3 ml-3"
        :dom-node="imageArea"
      />
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, ref, Ref, computed, onMounted, reactive, watch } from '@vue/composition-api'
import { Image } from 'upng-js'
import resize from 'vue-resize-directive'

import IonImageViewer from '../../components/IonImageViewer'
import FadeTransition from '../../components/FadeTransition'
import ImageSaver from './ImageSaver.vue'
import IonImageMenu from './IonImageMenu.vue'
import openMenu from './menuState'
import { IonImage, ColorMap, loadPngFromUrl, processIonImage, ScaleType } from '../../lib/ionImageRendering'
import createColorMap from '../../lib/createColormap'
import getColorScale from '../../lib/getColorScale'
import fitImageToArea, { FitImageToAreaResult } from '../../lib/fitImageToArea'

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

interface IonImageLayer {
  colorbar: Ref<string>
  image: Ref<IonImage | null>
  state: IonImageLayerState
}

interface IonImageState {
  order: string[]
  activeLayer: string | null
}

interface Props {
  annotation: Annotation
  colormap: string
  opacity: number
  imageLoaderSettings: any
  applyImageMove: Function
  pixelSizeX: number
  pixelSizeY: number
  scaleBarColor: string | null
  scaleType?: ScaleType
}

const ImageViewer = defineComponent<Props>({
  name: 'ImageVewer',
  components: {
    FadeTransition,
    ImageSaver,
    IonImageMenu,
    IonImageViewer,
  },
  directives: {
    resize,
  },
  props: {
    annotation: { required: true, type: Object },
    colormap: { required: true, type: String },
    opacity: { required: true, type: Number },
    imageLoaderSettings: { required: true, type: Object },
    applyImageMove: { required: true, type: Function },
    pixelSizeX: { type: Number },
    pixelSizeY: { type: Number },
    scaleBarColor: { type: String },
    scaleType: { type: String },
  },
  setup(props) {
    const ionImageState = reactive<IonImageState>({
      order: [],
      activeLayer: null,
    })
    const ionImageLayerCache : Record<string, IonImageLayer> = {}

    const orderedIonImageLayers = computed(() => ionImageState.order.map(id => ionImageLayerCache[id]))

    // const colorMapCache: Record<string, Ref<ColorMap>> = {}
    const colorMaps = computed(() => {
      const { opacityMode, annotImageOpacity } = props.imageLoaderSettings
      const colorMapCache: Record<string, ColorMap> = {}
      for (const { state } of orderedIonImageLayers.value) {
        if (!(state.channel in colorMapCache)) {
          colorMapCache[state.channel] = createColorMap(state.channel, opacityMode, annotImageOpacity)
        }
      }
      return colorMapCache
    })

    const ionImageLayers = computed(() => {
      const toRender = []
      for (const { state, image } of orderedIonImageLayers.value) {
        if (image.value == null || !state.visible) {
          continue
        }
        toRender.push({
          ionImage: image.value,
          colorMap: colorMaps.value[state.channel],
        })
      }
      return toRender
    })

    const ionImageMenuItems = computed(() => {
      return orderedIonImageLayers.value.map(({ state, colorbar }) => ({
        colorbar: colorbar.value,
        layer: state,
      }))
    })

    const channels = ['red', 'green', 'blue', 'magenta', 'yellow', 'cyan', 'orange']
    let nextChannel = -1

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

    watch(() => props.annotation, () => {
      const { id } = props.annotation
      const [isotopeImage] = props.annotation.isotopeImages
      const { minIntensity = 0, maxIntensity = 1 } = isotopeImage || {}
      const state = reactive<IonImageLayerState>({
        annotation: props.annotation,
        channel: '',
        id,
        label: undefined,
        maxIntensity,
        minIntensity,
        quantileRange: [0, 1],
        visible: true,
      })

      if (ionImageState.activeLayer !== null) {
        const idx = deleteLayer(ionImageState.activeLayer)
        ionImageState.order.splice(idx, 0, id)
      } else {
        ionImageState.order.push(id)
        nextChannel++ // only iterate channel for new layers
      }
      state.channel = channels[nextChannel % channels.length]

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
        colorbar: computed(() => {
          const { channel, quantileRange } = state
          const { domain, range } = getColorScale(channel)
          const [minQuantile, maxQuantile] = quantileRange
          const colors = []
          if (minQuantile > 0) {
            colors.push(`${range[0]} 0%`)
          }
          for (let i = 0; i < domain.length; i++) {
            const pct = (minQuantile + (domain[i] * (maxQuantile - minQuantile))) * 100
            colors.push(range[i] + ' ' + (pct + '%'))
          }
          return `background-image: linear-gradient(to right, ${colors.join(', ')})`
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

    const imageArea = ref<HTMLElement | null>(null)

    const dimensions = reactive({
      width: 500,
      height: 500,
    })

    function onResize() {
      if (imageArea.value != null) {
        dimensions.width = imageArea.value.clientWidth
        dimensions.height = Math.min(Math.max(window.innerHeight - 520, 500), 1000)
      }
    }

    const imageFit = computed(() => {
      const [ionImageLayer] = ionImageLayers.value
      let width = 500
      let height = 500
      if (ionImageLayer && ionImageLayer.ionImage) {
        width = ionImageLayer.ionImage.width
        height = ionImageLayer.ionImage.height
      }
      return fitImageToArea({
        imageWidth: width,
        imageHeight: height / props.imageLoaderSettings.pixelAspectRatio,
        areaWidth: dimensions.width,
        areaHeight: dimensions.height,
      })
    })

    return {
      dimensions,
      imageArea,
      imageFit,
      ionImageLayers,
      ionImageMenuItems,
      ionImageState,
      onResize,
      openMenu,
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
      handleImageMove({ zoom, xOffset, yOffset }: any) {
        props.applyImageMove({
          zoom: zoom / imageFit.value.imageZoom,
          xOffset,
          yOffset,
        })
      },
      deleteLayer(id: string) {
        if (ionImageState.order.length > 1) {
          deleteLayer(id)
        }
      },
    }
  },
})

export default ImageViewer
</script>
