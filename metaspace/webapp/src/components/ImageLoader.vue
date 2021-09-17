<template>
  <div
    ref="container"
    v-resize="onResize"
  >
    <ion-image-viewer
      ref="imageLoader"
      :ion-image-layers="ionImageLayers"
      :is-loading="ionImageIsLoading"
      :width="imageFit.areaWidth"
      :height="imageFit.areaHeight"
      :pixel-aspect-ratio="pixelAspectRatio"
      :zoom="zoom"
      :x-offset="xOffset"
      :y-offset="yOffset"
      :style="imageStyle"
      v-bind="$attrs"
      v-on="$listeners"
    />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import resize from 'vue-resize-directive'
import config from '../lib/config'
import { Component, Prop, Watch } from 'vue-property-decorator'
import IonImageViewer from './IonImageViewer'
import { IonImage, loadPngFromUrl, processIonImage, ScaleType, IonImageLayer } from '../lib/ionImageRendering'
import fitImageToArea, { FitImageToAreaResult } from '../lib/fitImageToArea'
import reportError from '../lib/reportError'
import createColormap, { OpacityMode } from '../lib/createColormap'

  @Component({
    inheritAttrs: false,
    directives: {
      resize,
    },
    components: {
      IonImageViewer,
    },
  })
export default class ImageLoader extends Vue {
    $refs: any;

    @Prop()
    src!: string | null;

    @Prop()
    imagePosition!: any;

    @Prop()
    imageStyle!: any;

    @Prop()
    minIntensity?: number;

    @Prop()
    maxIntensity?: number;

    @Prop()
    pixelAspectRatio!: number;

    @Prop({ type: String })
    scaleType?: ScaleType;

    @Prop({ default: 'Viridis' })
    colormap!: string;

    @Prop()
    opacityMode?: OpacityMode;

    @Prop()
    annotImageOpacity?: number;

    @Prop()
    normalizationData?: any;

    containerWidth = 500;
    containerHeight = 500;
    ionImage: IonImage | null = null;
    ionImageIsLoading = false;

    created() {
      const ignoredPromise = this.updateIonImage()
    }

    mounted() {
      this.onResize()
    }

    onResize() {
      if (this.$refs.container != null) {
        this.containerWidth = this.$refs.container.clientWidth
        this.containerHeight = this.$refs.container.clientHeight
      }
    }

    async updateIonImage() {
      // Keep track of which image is loading so that this can bail if src changes before the download finishes
      const newUrl = this.src

      if (newUrl != null) {
        this.ionImageIsLoading = true
        try {
          const png = await loadPngFromUrl((config.imageStorage || '') + newUrl)

          if (newUrl === this.src) {
            this.ionImage = processIonImage(png, this.minIntensity, this.maxIntensity, this.scaleType,
              undefined, undefined, this.normalizationData)
            this.ionImageIsLoading = false
          }
        } catch (err) {
          reportError(err, null)
          if (newUrl === this.src) {
            this.ionImage = null
            this.ionImageIsLoading = false
          }
        }
      }
    }

    @Watch('src')
    async updateImageSrc() {
      this.updateIonImage()
    }

    @Watch('normalizationData')
    async updateIonImageNormalization() {
      this.updateIonImage()
    }

    get zoom() {
      return (this.imagePosition && this.imagePosition.zoom || 1) * this.imageFit.imageZoom
    }

    get xOffset() {
      return this.imagePosition && this.imagePosition.xOffset || 0
    }

    get yOffset() {
      return this.imagePosition && this.imagePosition.yOffset || 0
    }

    get imageFit(): FitImageToAreaResult {
      return fitImageToArea({
        imageWidth: this.ionImage ? this.ionImage.width : this.containerWidth,
        imageHeight: (this.ionImage ? this.ionImage.height : this.containerHeight) / this.pixelAspectRatio,
        areaWidth: this.containerWidth,
        areaHeight: this.containerHeight,
      })
    }

    get ionImageLayers(): IonImageLayer[] {
      if (this.ionImage) {
        return [{
          ionImage: this.ionImage,
          colorMap: createColormap(this.colormap, this.opacityMode, this.annotImageOpacity),
        }]
      }
      return []
    }

    @Watch('imageFit')
    emitRedrawEvent() {
      this.$emit('redraw', {
        width: this.imageFit.areaWidth,
        height: this.imageFit.areaHeight,
        naturalWidth: this.ionImage ? this.ionImage.width : 0,
        naturalHeight: this.ionImage ? this.ionImage.height : 0,
      })
    }
}
</script>
