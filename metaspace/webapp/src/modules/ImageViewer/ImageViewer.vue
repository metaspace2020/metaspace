<template>
  <div
    class="relative"
  >
    <div
      ref="imageArea"
      v-resize="onResize"
    >
      <ion-image-viewer
        :height="dimensions.height"
        :image-height="ionImageDimensions.height"
        :image-width="ionImageDimensions.width"
        :ion-image-layers="ionImageLayers"
        :is-loading="isLoading"
        :max-zoom="imageFit.imageZoom * 20"
        :min-zoom="imageFit.imageZoom / 4"
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
    <div
      class="absolute top-0 right-0 py-3 mr-2 h-full box-border flex flex-col justify-between items-end w-0 v-rhythm-3 sm-side-bar"
    >
      <fade-transition v-if="openMenu === 'ION'">
        <ion-image-menu
          v-if="mode === 'MULTI'"
          key="multi"
          :menu-items="ionImageMenuItems"
        />
        <single-ion-image-controls
          v-else-if="!isLoading"
          key="single"
          :state="singleIonImageControls.state"
          :intensity="singleIonImageControls.intensity.value"
          :color-bar="singleIonImageControls.colorBar.value"
          :update-intensity="singleIonImageControls.updateIntensity"
        />
      </fade-transition>
      <fade-transition>
        <opacity-settings
          v-if="openMenu === 'ION' && hasOpticalImage"
          key="opacity"
          class="sm-leading-trim mt-auto"
          :opacity="opacity"
          @opacity="emitOpacity"
        />
      </fade-transition>
      <fade-transition v-if="lockIntensityEnabled">
        <intensity-settings
          v-if="openMenu === 'ION'"
          key="ion-settings"
          class="sm-leading-trim"
          :has-optical-image="hasOpticalImage"
          :opacity="opacity"
          @opacity="emitOpacity"
        />
      </fade-transition>
    </div>
    <image-saver
      class="absolute top-0 left-0 mt-3 ml-3"
      :dom-node="imageArea"
    />
  </div>
</template>
<script lang="ts">
import { defineComponent, computed, reactive, ref, toRefs, onMounted } from '@vue/composition-api'
import { Image } from 'upng-js'
import resize from 'vue-resize-directive'

import IonImageViewer from '../../components/IonImageViewer'
import FadeTransition from '../../components/FadeTransition'
import ImageSaver from './ImageSaver.vue'
import IonImageMenu from './IonImageMenu.vue'
import SingleIonImageControls from './SingleIonImageControls.vue'
import IntensitySettings from './IntensitySettings.vue'
import OpacitySettings from './OpacitySettings.vue'

import viewerState, { resetImageViewerState } from './state'
import { resetIonImageState } from './ionImageState'
import useIonImages from './useIonImages'
import fitImageToArea, { FitImageToAreaResult } from '../../lib/fitImageToArea'
import { ScaleType } from '../../lib/ionImageRendering'
import config from '../../lib/config'

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
  name: 'ImageViewer',
  components: {
    FadeTransition,
    ImageSaver,
    IonImageMenu,
    IonImageViewer,
    SingleIonImageControls,
    IntensitySettings,
    OpacitySettings,
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
  setup(props, { root, emit }) {
    const {
      ionImageLayers,
      ionImageMenuItems,
      singleIonImageControls,
      ionImagesLoading,
      ionImageDimensions,
    } = useIonImages(props)

    // don't think this is the best way to do it
    root.$store.watch((_, getters) => getters.filter.datasetIds, (datasetIds = [], previous) => {
      if (datasetIds.length !== 1 || (previous && previous[0] !== datasetIds[0])) {
        resetIonImageState()
        resetImageViewerState()
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

    onMounted(onResize)

    const imageFit = computed(() => {
      const { width = 500, height = 500 } = ionImageDimensions.value
      return fitImageToArea({
        imageWidth: width,
        imageHeight: height / props.imageLoaderSettings.pixelAspectRatio,
        areaWidth: dimensions.width,
        areaHeight: dimensions.height,
      })
    })

    return {
      imageArea,
      dimensions,
      ionImageDimensions,
      imageFit,
      onResize,
      ionImageLayers,
      ionImageMenuItems,
      singleIonImageControls,
      isLoading: ionImagesLoading,
      openMenu: viewerState.menu,
      mode: viewerState.mode,
      handleImageMove({ zoom, xOffset, yOffset }: any) {
        props.applyImageMove({
          zoom: zoom / imageFit.value.imageZoom,
          xOffset,
          yOffset,
        })
      },
      emitOpacity(value: number) {
        emit('opacity', value)
      },
      hasOpticalImage: computed(() => !!props.imageLoaderSettings.opticalSrc),
      lockIntensityEnabled: config.features.lock_intensity,
    }
  },
})

export default ImageViewer
</script>
<style scoped>
.sm-side-bar > * {
  @apply w-60;
}

.sm-leading-trim > :first-child {
  margin-top: calc(-1 * theme('spacing.3') / 2); /* hacking */
}
</style>
