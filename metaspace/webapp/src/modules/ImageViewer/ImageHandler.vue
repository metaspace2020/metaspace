<template>
  <div
    ref="imageViewerContainer"
    v-resize="onResize"
  >
    <ion-image-viewer
      ref="imageLoader"
      :ion-image="ionImages"
      :is-loading="ionImageIsLoading"
      :colormap="colormap"
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
    />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import resize from 'vue-resize-directive'
import { Component, Prop, Watch } from 'vue-property-decorator'
import { saveAs } from 'file-saver'
import IonImageViewer from '../../components/IonImageViewer'
import domtoimage from 'dom-to-image-google-font-issue'
import { IonImage, loadPngFromUrl, processIonImage, ScaleType } from '../../lib/ionImageRendering'
import { get } from 'lodash-es'
import fitImageToArea, { FitImageToAreaResult } from '../../lib/fitImageToArea'
import reportError from '../../lib/reportError'
import { Image } from 'upng-js'

@Component({
  name: 'main-image',
  directives: {
    resize,
  },
  components: {
    IonImageViewer,
  },
})
export default class MainImage extends Vue {
    $refs: any

    @Prop({ required: true })
    annotation!: any

    @Prop({ required: true, type: Array })
    colormap!: number[][][]

    @Prop({ required: true, type: Number })
    opacity!: number

    @Prop()
    ionImages: IonImage[] | null = null

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

    ionImageUrl: string | null = null;
    ionImagePng: Image[] | null = null;
    ionImageIsLoading = false;
    imageViewerWidth: number = 500;
    imageViewerHeight: number = 500;

    mounted() {
      this.onResize()
    }

    onResize() {
      if (this.$refs.imageViewerContainer != null) {
        this.imageViewerWidth = this.$refs.imageViewerContainer.clientWidth
        this.imageViewerHeight = Math.min(Math.max(window.innerHeight - 520, 500), 1000)
      }
    }

    get ionImage(): IonImage | null {
      if (this.ionImages != null) {
        return this.ionImages[0]
      } else {
        return null
      }
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
      this.$emit('opacityInput', val)
    }

    handleImageMove({ zoom, xOffset, yOffset }: any) {
      this.applyImageMove({
        zoom: zoom / this.imageFit.imageZoom,
        xOffset,
        yOffset,
      })
    }
}
</script>
