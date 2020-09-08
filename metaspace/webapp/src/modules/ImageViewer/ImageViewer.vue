<template>
  <div
    class="relative"
  >
    <fade-transition>
      <ion-image-menu
        v-if="openMenu === 'ION'"
        key="ION"
      />
      <optical-image-menu
        v-if="openMenu === 'OPTICAL'"
        key="OPTICAL"
      />
    </fade-transition>
    <image-handler
      :annotation="annotation"
      :colormap="colormap"
      :opacity="opacity"
      :image-loader-settings="imageLoaderSettings"
      :apply-image-move="applyImageMove"
      :pixel-size-x="pixelSizeX"
      :pixel-size-y="pixelSizeY"
      :scale-bar-color="scaleBarColor"
      :scale-type="scaleType"
    />
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'
import { Image } from 'upng-js'

import ImageHandler from './ImageHandler.vue'
import FadeTransition from '../../components/FadeTransition'
import IonImageMenu from './IonImageMenu.vue'

import openMenu from './menuState'
import { ScaleType } from '../../lib/ionImageRendering'

interface State {
  ionImageUrl: string | null
  ionImagePng: Image[] | null
  ionImageIsLoading: boolean
  imageViewerWidth: number
  imageViewerHeight: number
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
  setup() {
    return {
      openMenu,
    }
  },
})

export default ImageViewer
</script>
