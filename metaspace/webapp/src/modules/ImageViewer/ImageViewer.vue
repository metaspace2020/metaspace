<template>
  <div
    class="relative"
  >
    <fade-transition>
      <ion-image-menu
        v-if="openMenu === 'ION'"
        key="ION"
        :layers="ionImageLayerState"
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
      class="ready"
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
        @move="applyImageMove"
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
import ImageSaver from './ImageSaver.vue'
import FadeTransition from '../../components/FadeTransition'
import IonImageMenu from './IonImageMenu.vue'

import openMenu from './menuState'
import { IonImage, ColorMap, loadPngFromUrl, processIonImage, ScaleType } from '../../lib/ionImageRendering'
import createColorMap from '../../lib/createColormap'
import fitImageToArea, { FitImageToAreaResult } from '../../lib/fitImageToArea'

interface IonImageLayer {
  id: string
  minIntensity: number
  maxIntensity: number
  intensityRange: [number, number]
  channel: string
  visible: boolean
}

interface IonImageState {
  layers: Record<string, IonImageLayer>
  order: string[]
  activeLayer: string | null
}

interface Props {
  annotation: any
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
    IonImageViewer,
    ImageSaver,
    FadeTransition,
    IonImageMenu,
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
    const ionImages = reactive<IonImageState>({
      layers: {},
      order: [],
      activeLayer: null,
    })
    const imgCache: Record<string, Image> = {}
    const processedCache: Record<string, Ref<IonImage>> = {}
    const colorMapCache: Record<string, Ref<ColorMap>> = {}

    const ionImageLayerState = computed(() => ionImages.order.map(id => ionImages.layers[id]))

    const ionImageLayers = computed(() => {
      const toRender = []
      for (const layer of ionImageLayerState.value) {
        if (layer.visible) {
          toRender.push({
            ionImage: processedCache[layer.id].value,
            colorMap: colorMapCache[layer.id].value,
          })
        }
      }
      return toRender
    })

    const cmaps = computed(() => {
      const { opacityMode, annotImageOpacity } = props.imageLoaderSettings
      const maps: Record<string, number[][]> = {}
      for (const layer of ionImageLayerState.value) {
        maps[layer.id] = createColorMap(layer.channel, opacityMode, annotImageOpacity)
      }
      return maps
    })

    const channels = ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow']
    const nextChannel = 0

    watch(() => props.annotation, () => {
      console.log(props.annotation)
    })
    // Promise.all(
    //   testImages.map(id => loadPngFromUrl(`https://staging.metaspace2020.eu/fs/iso_images/${id}`)),
    // )
    //   .then(imgs => {
    //     ionImageLayers.value = imgs.map((png, i) => {
    //       const id = testImages[i]
    //       imgCache[id] = png
    //       return {
    //         id: testImages[i],
    //         minIntensity: 0,
    //         maxIntensity: 2.5,
    //         intensityRange: [0, 2.5],
    //         channel: channels[i],
    //       }
    //     })
    //     console.log('test', ionImageLayers)
    //   })

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
      const { width = 500, height = 500 } = ionImageLayer ? ionImageLayer.ionImage : {}
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
      ionImageLayerState,
      onResize,
      openMenu,
      updateIntensity(id: string, range: [number, number]) {
        const layer = ionImages.layers[id]
        if (layer) {
          layer.intensityRange = range
        }
      },
    }
  },
})

export default ImageViewer
</script>
