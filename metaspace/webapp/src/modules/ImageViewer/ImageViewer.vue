<template>
  <div
    class="relative"
  >
    <div
      ref="imageArea"
      v-resize="onResize"
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
    </div>
    <fade-transition>
      <ion-image-menu
        v-if="openMenu === 'ION'"
        key="ION"
      />
      <!-- <optical-image-menu
        v-if="openMenu === 'OPTICAL'"
        key="OPTICAL"
      /> -->
    </fade-transition>
    <image-saver
      class="absolute top-0 left-0 mt-3 ml-3"
      :dom-node="imageArea"
    />
  </div>
</template>
<script lang="ts">
import { defineComponent, computed, reactive, ref } from '@vue/composition-api'
import { Image } from 'upng-js'
import resize from 'vue-resize-directive'

import IonImageViewer from '../../components/IonImageViewer'
import FadeTransition from '../../components/FadeTransition'
import ImageSaver from './ImageSaver.vue'
import IonImageMenu from './IonImageMenu.vue'

import viewerState from './state'
import { useIonImages } from './ionImageState'
import fitImageToArea, { FitImageToAreaResult } from '../../lib/fitImageToArea'
import { ScaleType } from '../../lib/ionImageRendering'

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
    const { ionImageLayers } = useIonImages(props)
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
      onResize,
      openMenu: viewerState.menu,
      ionImageLayers,
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
