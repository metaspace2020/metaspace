<template>
  <div
    ref="container"
    class="main-ion-image-container"
  >
    <div
      ref="imageViewerContainer"
      v-resize="onResize"
      class="image-viewer-container"
    >
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

    <div
      v-if="!hideColorBar"
      class="colorbar-container"
    >
      <div
        v-if="imageLoaderSettings.opticalSrc"
        class="opacity-slider dom-to-image-hidden"
      >
        Opacity:
        <el-slider
          vertical
          height="150px"
          :value="opacity"
          :min="0"
          :max="1"
          :step="0.01"
          style="margin: 10px 0px 30px 0px;"
          @input="onOpacityInput"
        />
      </div>

      <el-tooltip
        v-if="ionImage && ionImage.maxIntensity !== ionImage.clippedMaxIntensity"
        placement="left"
      >
        <div>
          <div style="color: red">
            {{ ionImage.clippedMaxIntensity.toExponential(2) }}
          </div>
        </div>
        <div slot="content">
          Hot-spot removal has been applied to this image. <br>
          Pixel intensities above the {{ ionImage.maxQuantile*100 }}th percentile, {{ ionImage.clippedMaxIntensity.toExponential(2) }},
          have been reduced to {{ ionImage.clippedMaxIntensity.toExponential(2) }}. <br>
          The highest intensity before hot-spot removal was {{ ionImage.maxIntensity.toExponential(2) }}.
        </div>
      </el-tooltip>
      <div v-else>
        {{ ionImage && ionImage.maxIntensity.toExponential(2) }}
      </div>
      <colorbar
        style="width: 20px; height: 160px; align-self: center;"
        :map="colormap"
        :ion-image="ionImage"
      />
      {{ ionImage && ionImage.clippedMinIntensity.toExponential(2) }}

      <div class="annot-view__image-download dom-to-image-hidden">
        <!-- see https://github.com/tsayen/dom-to-image/issues/155 -->
        <img
          v-if="browserSupportsDomToImage"
          src="../../../../assets/download-icon.png"
          width="32px"
          title="Save visible region in PNG format"
          @click="saveImage"
        >
        <img
          v-else
          src="../../../../assets/download-icon.png"
          width="32px"
          style="opacity: 0.3"
          title="Your browser is not supported"
          @click="showBrowserWarning"
        >
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import resize from 'vue-resize-directive'
import { Component, Prop, Watch } from 'vue-property-decorator'
import { saveAs } from 'file-saver'
import Colorbar from './Colorbar.vue'
import IonImageViewer from '../../../../components/IonImageViewer'
import domtoimage from 'dom-to-image-google-font-issue'
import { IonImage, loadPngFromUrl, processIonImage, ScaleType, IonImageLayer } from '../../../../lib/ionImageRendering'
import { get } from 'lodash-es'
import fitImageToArea, { FitImageToAreaResult } from '../../../../lib/fitImageToArea'
import reportError from '../../../../lib/reportError'
import { Image } from 'upng-js'
import createColormap from '../../../../lib/createColormap'

@Component({
  name: 'main-image',
  directives: {
    resize,
  },
  components: {
    IonImageViewer,
    Colorbar,
  },
})
export default class MainImage extends Vue {
    $refs: any

    @Prop({ required: true })
    annotation!: any

    @Prop({ required: true, type: String })
    colormap!: string

    @Prop({ required: true, type: Number })
    opacity!: number

    @Prop({ required: true })
    imageLoaderSettings!: any

    @Prop({ required: true, type: Function })
    applyImageMove!: Function

    @Prop({ type: Number })
    pixelSizeX!: number

    @Prop({ type: Number })
    pixelSizeY!: number

    @Prop({ type: String })
    scaleBarColor!: string | null

    @Prop({ type: String })
    scaleType?: ScaleType

    @Prop({ type: Array })
    userScaling?: [number, number]

    @Prop({ type: Boolean })
    keepPixelSelected?: boolean

    @Prop({ type: Boolean })
    isNormalized?: boolean

    @Prop({ type: Boolean })
    hideColorBar?: boolean

    @Prop({ type: Object })
    normalizationData?: any

    ionImageUrl: string | null = null;
    ionImagePng: Image | null = null;
    ionImageIsLoading = false;
    imageViewerWidth: number = 500;
    imageViewerHeight: number = 500;

    created() {
      const ignoredPromise = this.updateIonImage()
    }

    mounted() {
      this.onResize()
    }

    onResize() {
      if (this.$refs.imageViewerContainer != null) {
        this.imageViewerWidth = this.$refs.imageViewerContainer.clientWidth
        this.imageViewerHeight = Math.min(Math.max(window.innerHeight - 520, 500), 1000)
      }
    }

    @Watch('annotation')
    async updateIonImage() {
      const isotopeImage = get(this.annotation, 'isotopeImages[0]')
      const newUrl = isotopeImage != null ? isotopeImage.url : null
      if (newUrl != null && newUrl !== this.ionImageUrl) {
        this.ionImageUrl = newUrl
        this.ionImageIsLoading = true
        try {
          const png = await loadPngFromUrl(newUrl)
          if (newUrl === this.ionImageUrl) {
            this.ionImagePng = png
            this.ionImageIsLoading = false
          }
        } catch (err) {
          reportError(err, null)
          if (newUrl === this.ionImageUrl) {
            this.ionImagePng = null
            this.ionImageIsLoading = false
          }
        }
      }
    }

    get ionImage(): IonImage | null {
      if (this.ionImagePng != null) {
        const isotopeImage = get(this.annotation, 'isotopeImages[0]')
        const { minIntensity, maxIntensity } = isotopeImage
        return processIonImage(this.ionImagePng, minIntensity, maxIntensity, this.scaleType, this.userScaling
          , undefined, this.isNormalized ? this.normalizationData : null)
      } else {
        return null
      }
    }

    get ionImageLayers(): IonImageLayer[] {
      if (this.ionImage) {
        const { opacityMode, annotImageOpacity } = this.imageLoaderSettings
        return [{
          ionImage: this.ionImage,
          colorMap: createColormap(this.colormap, opacityMode, annotImageOpacity),
        }]
      }
      return []
    }

    get imageFit(): FitImageToAreaResult {
      const { width = 500, height = 500 } = this.ionImage || {}
      return fitImageToArea({
        imageWidth: width,
        imageHeight: height / this.imageLoaderSettings.pixelAspectRatio,
        areaWidth: this.imageViewerWidth,
        areaHeight: this.imageViewerHeight,
      })
    }

    async saveImage() {
      const node = this.$refs.container
      const blob = await domtoimage.toBlob(node, {
        width: node.clientWidth,
        height: node.clientHeight,
        filter: el => !el.classList || !el.classList.contains('dom-to-image-hidden'),
      })
      saveAs(blob, `${this.annotation.id}.png`)
    }

    showBrowserWarning() {
      this.$alert('Due to technical limitations we are only able to support downloading layered and/or zoomed images'
      + ' on Chrome and Firefox. As a workaround, it is possible to get a copy of the raw ion image by right-clicking '
      + 'it and clicking "Save picture as", however this will not take into account your current zoom '
      + 'settings or show the optical image.')
        .catch(() => { /* Ignore exception raised when alert is closed */ })
    }

    get browserSupportsDomToImage(): boolean {
      return window.navigator.userAgent.includes('Chrome')
          || window.navigator.userAgent.includes('Firefox')
    }

    onOpacityInput(val: number): void {
      this.$emit('opacity', val)
    }

    handleImageMove({ zoom, xOffset, yOffset }: any) {
      this.applyImageMove({
        zoom: zoom / this.imageFit.imageZoom,
        xOffset,
        yOffset,
      })
    }

    handlePixelSelect({ x, y }: any) {
      this.$emit('pixel-select', { x, y })
    }
}
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
    flex:none;
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
