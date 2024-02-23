<template>
  <div ref="container" class="main-ion-image-container">
    <div ref="imageViewerContainer" v-resize="onResize" class="image-viewer-container">
      <ion-image-viewer
        ref="imageLoader"
        :keep-pixel-selected="keepPixelSelected"
        :ion-image-layers="ionImageLayers"
        :is-loading="ionImageIsLoading"
        :pixel-size-x="pixelSizeX"
        :pixel-size-y="pixelSizeY"
        :pixel-aspect-ratio="imageLoaderSettings.pixelAspectRatio"
        :scale-bar-color="scaleBarColor"
        :width="imageViewerWidth"
        :height="imageViewerHeight"
        :zoom="imageLoaderSettings.imagePosition.zoom * imageFit.imageZoom"
        :min-zoom="imageFit.imageZoom / 4"
        :max-zoom="imageFit.imageZoom * 20"
        :x-offset="imageLoaderSettings.imagePosition.xOffset"
        :y-offset="imageLoaderSettings.imagePosition.yOffset"
        scroll-block
        show-pixel-intensity
        v-bind="imageLoaderSettings"
        @move="handleImageMove"
        @pixel-select="handlePixelSelect"
      />
    </div>

    <div v-if="!hideColorBar" class="colorbar-container">
      <div v-if="imageLoaderSettings.opticalSrc" class="opacity-slider dom-to-image-hidden">
        Opacity:
        <el-slider
          vertical
          height="150px"
          :model-value="opacity"
          :min="0"
          :max="1"
          :step="0.01"
          style="margin: 10px 0px 30px 0px"
          @input="onOpacityInput"
        />
      </div>

      <el-tooltip v-if="ionImage && ionImage.maxIntensity !== ionImage.clippedMaxIntensity" placement="left">
        <div>
          <div style="color: red">
            {{ ionImage?.clippedMaxIntensity.toExponential(2) }}
          </div>
        </div>
        <template #content>
          <div>
            Hot-spot removal has been applied to this image. <br />
            Pixel intensities above the {{ ionImage?.maxQuantile * 100 }}th percentile,
            {{ ionImage?.clippedMaxIntensity.toExponential(2) }}, have been reduced to
            {{ ionImage?.clippedMaxIntensity.toExponential(2) }}. <br />
            The highest intensity before hot-spot removal was {{ ionImage?.maxIntensity.toExponential(2) }}.
          </div>
        </template>
      </el-tooltip>
      <div v-else>
        {{ ionImage && ionImage?.maxIntensity.toExponential(2) }}
      </div>
      <colorbar style="width: 20px; height: 160px; align-self: center" :map="colormap" :ion-image="ionImage" />
      {{ ionImage && ionImage?.clippedMinIntensity.toExponential(2) }}

      <div class="annot-view__image-download dom-to-image-hidden">
        <!-- see https://github.com/tsayen/dom-to-image/issues/155 -->
        <img
          v-if="browserSupportsDomToImage"
          src="../../../../assets/download-icon.png"
          width="32px"
          title="Save visible region in PNG format"
          @click="saveImage"
        />
        <img
          v-else
          src="../../../../assets/download-icon.png"
          width="32px"
          style="opacity: 0.3"
          title="Your browser is not supported"
          @click="showBrowserWarning"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, watch, computed } from 'vue'
import { ElMessageBox, ElSlider, ElTooltip } from 'element-plus'
import IonImageViewer from '../../../../components/IonImageViewer'
import Colorbar from './Colorbar.vue'
import domtoimage from 'dom-to-image-google-font-issue'
import * as FileSaver from 'file-saver'
import { IonImage, loadPngFromUrl, processIonImage, IonImageLayer } from '../../../../lib/ionImageRendering'
import { get } from 'lodash-es'
import fitImageToArea, { FitImageToAreaResult } from '../../../../lib/fitImageToArea'
import reportError from '../../../../lib/reportError'
import createColormap from '../../../../lib/createColormap'
// @ts-ignore
import resize from 'vue3-resize-directive'

export default defineComponent({
  name: 'MainImage',
  components: {
    IonImageViewer,
    Colorbar,
    ElSlider,
    ElTooltip,
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
    pixelSizeX: Number,
    pixelSizeY: Number,
    scaleBarColor: String,
    scaleType: String,
    userScaling: Array,
    keepPixelSelected: Boolean,
    isNormalized: Boolean,
    hideColorBar: Boolean,
    normalizationData: Object,
  },
  setup(props, { emit }) {
    const container = ref(null)
    const imageViewerContainer = ref(null)
    const imageLoader = ref(null)
    const ionImageUrl = ref(null)
    const ionImagePng = ref(null)
    const ionImageIsLoading = ref(false)
    const imageViewerWidth = ref(500)
    const imageViewerHeight = ref(500)

    const updateIonImage = async () => {
      const isotopeImage = get(props.annotation, 'isotopeImages[0]')
      const newUrl = isotopeImage != null ? isotopeImage.url : null
      if (newUrl != null && newUrl !== ionImageUrl.value) {
        ionImageUrl.value = newUrl
        ionImageIsLoading.value = true
        try {
          const png = await loadPngFromUrl(newUrl)
          if (newUrl === ionImageUrl.value) {
            ionImagePng.value = png
            ionImageIsLoading.value = false
          }
        } catch (err) {
          reportError(err, null)
          if (newUrl === ionImageUrl.value) {
            ionImagePng.value = null
            ionImageIsLoading.value = false
          }
        }
      }
    }

    const onResize = () => {
      if (imageViewerContainer.value != null) {
        imageViewerWidth.value = imageViewerContainer.value.clientWidth
        imageViewerHeight.value = Math.min(Math.max(window.innerHeight - 520, 500), 1000)
      }
    }

    onMounted(() => {
      updateIonImage() // ignored promise
      onResize()
    })

    watch(props.annotation, async () => {
      updateIonImage()
    })

    const ionImage = computed((): IonImage | null | any => {
      if (ionImagePng.value != null) {
        const isotopeImage = get(props.annotation, 'isotopeImages[0]')
        const { minIntensity, maxIntensity } = isotopeImage
        return processIonImage(
          ionImagePng.value,
          minIntensity,
          maxIntensity,
          props.scaleType as any,
          props.userScaling as any,
          undefined,
          (props.isNormalized ? props.normalizationData : null) as any
        )
      } else {
        return null
      }
    })

    const ionImageLayers = computed((): IonImageLayer[] => {
      if (ionImage.value) {
        const { opacityMode, annotImageOpacity } = props.imageLoaderSettings
        return [
          {
            ionImage: ionImage.value,
            colorMap: createColormap(props.colormap, opacityMode, annotImageOpacity),
          },
        ]
      }
      return []
    })

    const imageFit = computed((): FitImageToAreaResult => {
      const { width = 500, height = 500 } = ionImage.value || {}
      return fitImageToArea({
        imageWidth: width,
        imageHeight: height / props.imageLoaderSettings.pixelAspectRatio,
        areaWidth: imageViewerWidth.value,
        areaHeight: imageViewerHeight.value,
      })
    })

    const saveImage = async () => {
      const node = container.value
      const blob = await domtoimage.toBlob(node, {
        width: node.clientWidth,
        height: node.clientHeight,
        filter: (el) => !el.classList || !el.classList.contains('dom-to-image-hidden'),
      })
      FileSaver.saveAs(blob, `${props.annotation.id}.png`)
    }

    const showBrowserWarning = () => {
      ElMessageBox.alert(
        'Due to technical limitations we are only able to support downloading layered and/or zoomed images' +
          ' on Chrome and Firefox. As a workaround, it is possible to get a copy of the raw ion image by ' +
          'right-clicking ' +
          'it and clicking "Save picture as", however this will not take into account your current zoom ' +
          'settings or show the optical image.'
      ).catch(() => {
        /* Ignore exception raised when alert is closed */
      })
    }

    const browserSupportsDomToImage = computed((): boolean => {
      return window.navigator.userAgent.includes('Chrome') || window.navigator.userAgent.includes('Firefox')
    })

    const onOpacityInput = (val: number | any): void => {
      emit('opacity', val)
    }

    const handleImageMove = ({ zoom, xOffset, yOffset }: any) => {
      props.applyImageMove({
        zoom: zoom / imageFit.value.imageZoom,
        xOffset,
        yOffset,
      })
    }

    const handlePixelSelect = ({ x, y }: any) => {
      emit('pixel-select', { x, y })
    }

    return {
      container,
      imageViewerContainer,
      imageLoader,
      ionImageUrl,
      ionImagePng,
      ionImageIsLoading,
      imageViewerWidth,
      imageViewerHeight,
      ionImage,
      ionImageLayers,
      imageFit,
      saveImage,
      showBrowserWarning,
      browserSupportsDomToImage,
      onOpacityInput,
      handleImageMove,
      handlePixelSelect,
      onResize,
    }
  },
})
</script>

<style>
.main-ion-image-container {
  display: flex;
  flex-direction: row;
  justify-content: center;
}

.image-viewer-container {
  flex: 1 1 auto;
  max-width: 100%;
  overflow: hidden;
}

.colorbar-container {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 6px 5px 0 5px;
}
.opacity-slider {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.annot-view__image-download {
  margin-top: 20px;
  cursor: pointer;
}
</style>
