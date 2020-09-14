<template>
  <div
    class="relative"
  >
    <fade-transition>
      <ion-image-menu
        v-if="openMenu === 'ION'"
        key="ION"
        :layers="ionImageLayerState"
        :active-layer="activeLayer"
        @input="updateIntensity"
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
import fitImageToArea, { FitImageToAreaResult } from '../../lib/fitImageToArea'

interface Annotation {
  id: string
  ion: string
  mz: number
  isotopeImages: { minIntensity: number, maxIntensity: number, url: string }[]
}

interface IonImageLayer {
  annotation: Annotation
  channel: string
  id: string
  intensityRange: [number, number] | undefined
  label: string | undefined
  minIntensity: number
  maxIntensity: number
  visible: boolean
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
    const imgCache = ref<Record<string, Image>>({})
    const processedCache: Record<string, Ref<IonImage | null>> = {}
    const layerCache: Record<string, Ref<IonImageLayer>> = {}

    const ionImageLayerState = computed(() => ionImageState.order.map(id => layerCache[id].value))

    // const colorMapCache: Record<string, Ref<ColorMap>> = {}
    const colorMaps = computed(() => {
      const { opacityMode, annotImageOpacity } = props.imageLoaderSettings
      const colorMapCache: Record<string, ColorMap> = {}
      for (const layer of ionImageLayerState.value) {
        if (!(layer.channel in colorMapCache)) {
          colorMapCache[layer.channel] = createColorMap(layer.channel, opacityMode, annotImageOpacity)
        }
      }
      return colorMapCache
    })

    const ionImageLayers = computed(() => {
      const toRender = []
      for (const layer of ionImageLayerState.value) {
        const processedImage = processedCache[layer.id]?.value
        if (processedImage == null || !layer.visible) {
          continue
        }
        toRender.push({
          ionImage: processedImage,
          colorMap: colorMaps.value[layer.channel],
        })
      }
      return toRender
    })

    const channels = ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow']
    let nextChannel = 0

    watch(() => props.annotation, () => {
      if (ionImageState.activeLayer === null) {
        const { id } = props.annotation
        const channel = channels[nextChannel % channels.length]
        nextChannel++
        const [isotopeImage] = props.annotation.isotopeImages
        const { minIntensity = 0, maxIntensity = 1 } = isotopeImage || {}
        const layer = ref({
          id,
          channel,
          minIntensity,
          maxIntensity,
          intensityRange: [minIntensity, maxIntensity] as [number, number],
          annotation: props.annotation,
          visible: true,
          label: undefined,
        })
        layerCache[id] = layer
        ionImageState.order.push(id)
        ionImageState.activeLayer = id

        processedCache[id] = computed(() => {
          const { intensityRange, minIntensity, maxIntensity } = layer.value
          if ((id in imgCache.value)) {
            return processIonImage(
              imgCache.value[id],
              minIntensity,
              maxIntensity,
              props.scaleType,
              intensityRange,
            )
          }
          return null
        })
        if (isotopeImage) {
          loadPngFromUrl(isotopeImage.url)
            .then(img => {
              imgCache.value = {
                ...imgCache.value,
                [id]: img,
              }
            })
        }
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
      activeLayer: ionImageState.activeLayer,
      dimensions,
      imageArea,
      imageFit,
      ionImageLayers,
      ionImageLayerState,
      onResize,
      openMenu,
      updateIntensity(id: string, range: [number, number]) {
        const layer = layerCache[id]
        if (layer) {
          layer.value.intensityRange = range
        }
      },
      handleImageMove({ zoom, xOffset, yOffset }: any) {
        props.applyImageMove({
          zoom: zoom / imageFit.value.imageZoom,
          xOffset,
          yOffset,
        })
      },
    }
  },
})

export default ImageViewer
</script>
