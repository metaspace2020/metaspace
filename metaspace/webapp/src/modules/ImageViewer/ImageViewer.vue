<template>
  <div
    class="relative"
  >
    <fade-transition>
      <ion-image-menu
        v-if="openMenu === 'ION'"
        key="ION"
        :layers="ionImageLayers"
        @input="updateIntensity"
      />
      <!-- <optical-image-menu
        v-if="openMenu === 'OPTICAL'"
        key="OPTICAL"
      /> -->
    </fade-transition>
    <image-handler
      :annotation="annotation"
      :opacity="opacity"
      :image-loader-settings="imageLoaderSettings"
      :apply-image-move="applyImageMove"
      :pixel-size-x="pixelSizeX"
      :pixel-size-y="pixelSizeY"
      :scale-bar-color="scaleBarColor"
      :scale-type="scaleType"

      :ion-images="ionImages"
    />
  </div>
</template>
<script lang="ts">
import { defineComponent, ref, Ref, computed, onMounted, reactive, watch } from '@vue/composition-api'
import { Image } from 'upng-js'

import ImageHandler from './ImageHandler.vue'
import FadeTransition from '../../components/FadeTransition'
import IonImageMenu from './IonImageMenu.vue'

import openMenu from './menuState'
import { IonImage, ColorMap, loadPngFromUrl, processIonImage, ScaleType } from '../../lib/ionImageRendering'
import createColorMap from '../../lib/createColormap'

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
    ImageHandler,
    FadeTransition,
    IonImageMenu,
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

    const ionImageLayers = computed(() => ionImages.order.map(id => ionImages.layers[id]))

    const ionImagesToRender = computed(() => {
      const toRender = []
      for (const layer of ionImageLayers.value) {
        if (layer.visible) {
          toRender.push([processedCache[layer.id], colorMapCache[layer.id]])
        }
      }
      return toRender
    })

    const cmaps = computed(() => {
      const { opacityMode, annotImageOpacity } = props.imageLoaderSettings
      const maps: Record<string, number[][]> = {}
      for (const layer of ionImageLayers.value) {
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

    return {
      openMenu,
      ionImages: ionImagesToRender,
      ionImageLayers,
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
