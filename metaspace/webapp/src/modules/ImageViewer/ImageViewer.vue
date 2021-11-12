<template>
  <div
    v-if="!hasNormalizationError"
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
        :show-normalized-intensity="showNormalizedIntensity"
        :normalization-data="normalizationData"
        :roi-info="roiInfo"
        :x-offset="imageLoaderSettings.imagePosition.xOffset"
        :y-offset="imageLoaderSettings.imagePosition.yOffset"
        :zoom="imageLoaderSettings.imagePosition.zoom * imageFit.imageZoom"
        scroll-block
        show-pixel-intensity
        v-bind="imageLoaderSettings"
        :keep-pixel-selected="keepPixelSelected"
        @move="handleImageMove"
        @pixel-select="handlePixelSelect"
        @roi-coordinate="handleRoiCoordinate"
      />
    </div>
    <div
      class="absolute top-0 right-0 py-3 mr-2 h-full box-border flex flex-col justify-between items-end w-0 v-rhythm-3 sm-side-bar"
    >
      <fade-transition v-if="openMenu === 'ION'">
        <ion-image-menu
          v-if="mode === 'MULTI'"
          key="multi"
          :is-normalized="showNormalizedIntensity"
          :menu-items="ionImageMenuItems"
        />
        <single-ion-image-controls
          v-else-if="!isLoading"
          key="single"
          :is-normalized="showNormalizedIntensity"
          v-bind="singleIonImageControls"
        />
      </fade-transition>
      <div
        v-if="openMenu === 'ION'"
        class="ion-slider-wrapper"
      >
        <div
          v-if="hasOpticalImage && !isIE"
          class="ion-slider-holder"
        >
          <fade-transition class="w-full">
            <opacity-settings
              key="opticalOpacity"
              label="Optical image visibility"
              class="sm-leading-trim mt-auto"
              :opacity="opticalOpacity"
              @opacity="emitOpticalOpacity"
            />
          </fade-transition>
        </div>
        <div
          v-if="hasOpticalImage"
          class="ion-slider-holder"
        >
          <fade-transition class="w-full">
            <opacity-settings
              key="opacity"
              label="Ion image opacity"
              class="sm-leading-trim mt-auto"
              :opacity="opacity"
              @opacity="emitOpacity"
            />
          </fade-transition>
        </div>
        <div
          v-if="lockIntensityEnabled"
          class="ion-slider-holder"
        >
          <fade-transition>
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
      </div>
    </div>
    <image-saver
      class="absolute top-0 left-0 mt-3 ml-3"
      :dom-node="imageArea"
    />
  </div>
  <div
    v-else
    class="normalization-error-wrapper"
  >
    <i class="el-icon-error info-icon mr-2" />
    <p class="text-lg">
      There was an error on normalization!
    </p>
  </div>
</template>
<script lang="ts">
import { defineComponent, computed, reactive, ref, toRefs, onMounted, watch } from '@vue/composition-api'
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
import isInsidePolygon from '../../lib/isInsidePolygon'
import FileSaver from 'file-saver'

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
  keepPixelSelected: boolean
  downloadRoi: number
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
    opticalOpacity: { type: Number },
    imageLoaderSettings: { required: true, type: Object },
    applyImageMove: { required: true, type: Function },
    pixelSizeX: { type: Number },
    pixelSizeY: { type: Number },
    scaleBarColor: { type: String },
    scaleType: { type: String },
    keepPixelSelected: { type: Boolean },
    downloadRoi: { type: Number },
    ticData: { type: Object },
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

    // download ROI feature
    watch(() => props.downloadRoi, () => {
      if (!Array.isArray(root.$store.state.roiInfo)
        || props.downloadRoi === -1 || root.$store.state.roiInfo.length - 1 < props.downloadRoi
        || !root.$store.state.roiInfo[props.downloadRoi]) {
        return
      }
      const rows = [['name', 'molecule', 'x', 'y', 'intensity']]
      const roiName : any = root.$store.state.roiInfo[props.downloadRoi].name
      let molIdx : number = 0

      for (const { ionImage } of ionImageLayers.value) {
        const { width, height, intensityValues } = ionImage
        const molName : any = ionImageMenuItems.value[molIdx].annotation.ion
        for (let x = 0; x < width; x++) {
          for (let y = 0; y < height; y++) {
            if (isInsidePolygon([x, y],
              root.$store.state.roiInfo[props.downloadRoi].coordinates.map((coordinate: any) => {
                return [coordinate.x, coordinate.y]
              }))) {
              const idx = y * width + x
              rows.push([roiName, molName, x, y, intensityValues[idx]])
            }
          }
        }
        molIdx += 1
      }

      const csv = rows.map(e => e.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv; charset="utf-8"' })
      FileSaver.saveAs(blob, `${roiName}.csv`)
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

    const isIE = computed(() => {
      // IE 10 and IE 11
      return /Trident\/|MSIE/.test(window.navigator.userAgent)
    })

    return {
      imageArea,
      dimensions,
      ionImageDimensions,
      imageFit,
      onResize,
      isIE,
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
      handlePixelSelect({ x, y }: any) {
        emit('pixel-select', { x, y })
      },
      handleRoiCoordinate({ x, y }: any) {
        emit('roi-coordinate', { x, y })
      },
      emitOpacity(value: number) {
        emit('opacity', value)
      },
      emitOpticalOpacity(value: number) {
        emit('opticalOpacity', value)
      },
      hasNormalizationError: computed(() =>
        root.$store.getters.settings.annotationView.normalization && root.$store.state.normalization
      && root.$store.state.normalization.error),
      showNormalizedIntensity: computed(() => root.$store.getters.settings.annotationView.normalization),
      roiInfo: computed(() => root.$store.state.roiInfo),
      normalizationData: computed(() => root.$store.state.normalization),
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

.ion-slider-wrapper{
  display: flex;
  flex-wrap: wrap;
}
.ion-slider-holder{
  display: flex;
  flex-wrap: wrap;
  width: 240px;
  @apply mt-2 ml-2;
}
.normalization-error-wrapper{
  height: 537px;
  width: 100%;
  @apply flex items-center justify-center;
}
.info-icon{
  font-size: 20px;
}
@media (min-width: 768px) {
  .ion-slider-wrapper{
    min-width: max-content;
  }
}
</style>
