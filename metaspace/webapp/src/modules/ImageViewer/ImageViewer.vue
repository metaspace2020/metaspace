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
      :colormap="colormap"
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
import { defineComponent, ref, computed, onMounted } from '@vue/composition-api'
import { Image } from 'upng-js'

import ImageHandler from './ImageHandler.vue'
import FadeTransition from '../../components/FadeTransition'
import IonImageMenu from './IonImageMenu.vue'

import openMenu from './menuState'
import { IonImage, loadPngFromUrl, processIonImage, ScaleType } from '../../lib/ionImageRendering'

interface IonImageLayer {
  id: string
  minIntensity: number
  maxIntensity: number
  intensityRange: [number, number]
}

interface State {
  ionImageLayers: IonImageLayer[]
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
    const ionImageLayers = ref<IonImageLayer[]>([])
    const imgCache: Record<string, Image> = {}

    const ionImages = computed(() => {
      if (ionImageLayers.value.length > 0) {
        return ionImageLayers.value.map(({ id, minIntensity, maxIntensity, intensityRange }) =>
          processIonImage(imgCache[id], minIntensity, maxIntensity, props.scaleType, intensityRange),
        )
      } else {
        return null
      }
    })

    const testImages = [
      'a9b14785639482df213409a1f40f543b',
      'f35789945c47c956ebb97086ac7c4126',
      'dc1448c23fbf53224091aa70ff4a7b71',
    ]

    Promise.all(
      testImages.map(id => loadPngFromUrl(`https://metaspace2020.eu/fs/iso_images/${id}`)),
    )
      .then(imgs => {
        ionImageLayers.value = imgs.map((png, i) => {
          const id = testImages[i]
          imgCache[id] = png
          return {
            id: testImages[i],
            minIntensity: 0,
            maxIntensity: 2.5e+4,
            intensityRange: [0, 2.5e+4],
          }
        })
        console.log('test', ionImageLayers)
      })

    return {
      openMenu,
      ionImages,
      ionImageLayers,
      updateIntensity(id: string, range: [number, number]) {
        const layer = ionImageLayers.value.find(_ => _.id === id)
        if (layer) {
          layer.intensityRange = range
        }
      },
    }
  },
})

export default ImageViewer
</script>
