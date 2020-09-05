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

    @Prop({ required: true, type: String })
    colormap!: string

    @Prop({ required: true, type: Number })
    opacity!: number

    @Prop({ required: true })
    imageLoaderSettings!: any

    @Prop({ required: true, type: Function })
    applyimageMove!: Function

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
      // const isotopeImage = get(this.annotation, 'isotopeImages[0]')
      // const newUrl = isotopeImage != null ? isotopeImage.url : null
      // if (newUrl != null && newUrl !== this.ionImageUrl) {
      //   this.ionImageUrl = newUrl
      //   this.ionImageIsLoading = true
      //   try {
      //     const png = await loadPngFromUrl(newUrl)
      //     if (newUrl === this.ionImageUrl) {
      //       this.ionImagePng = png
      //       this.ionImageIsLoading = false
      //     }
      //   } catch (err) {
      //     reportError(err, null)
      //     if (newUrl === this.ionImageUrl) {
      //       this.ionImagePng = null
      //       this.ionImageIsLoading = false
      //     }
      //   }
      // }
      this.ionImageIsLoading = true
      Promise.all([
        loadPngFromUrl('https://metaspace2020.eu/fs/iso_images/a9b14785639482df213409a1f40f543b'),
        loadPngFromUrl('https://metaspace2020.eu/fs/iso_images/f35789945c47c956ebb97086ac7c4126'),
        loadPngFromUrl('https://metaspace2020.eu/fs/iso_images/dc1448c23fbf53224091aa70ff4a7b71'),
      ])
        .then(imgs => {
          // this.__png1 = img
          this.ionImagePng = imgs
          this.ionImageIsLoading = false
          // console.log(this.__png1)
        })
    }

    get ionImages(): IonImage[] | null {
      // console.log(this.__png1)
      if (this.ionImagePng != null) {
        const isotopeImage = get(this.annotation, 'isotopeImages[0]')
        const { minIntensity = 0, maxIntensity = 5.57e+3 } = {}
        return this.ionImagePng.map(img =>
          processIonImage(img, minIntensity, maxIntensity, this.scaleType),
        )
      } else {
        return null
      }
    }

    get ionImage(): IonImage | null {
      // console.log(this.__png1)
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
      this.applyimageMove({
        zoom: zoom / this.imageFit.imageZoom,
        xOffset,
        yOffset,
      })
    }
}
</script>
