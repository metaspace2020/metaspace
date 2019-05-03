<template>
  <div ref="container" v-resize="onResize">
    <ion-image-viewer
      ref="imageLoader"
      :ionImage="ionImage"
      :isLoading="ionImageIsLoading"
      :width="imageFit.areaWidth"
      :height="imageFit.areaHeight"
      :zoom="imagePosition.zoom * imageFit.imageZoom"
      :xOffset="imagePosition.xOffset"
      :yOffset="imagePosition.yOffset"
      :style="imageStyle"
      v-bind="$attrs"
      v-on="$listeners"
    />
  </div>
</template>

<script lang="ts">
  import Vue from 'vue';
  import resize from 'vue-resize-directive';
  import config from '../config';
  import {Component, Prop, Watch} from 'vue-property-decorator';
  import IonImageViewer from './IonImageViewer.vue';
  import {IonImage, loadPngFromUrl, processIonImage} from '../lib/ionImageRendering';
  import fitImageToArea, {FitImageToAreaResult} from '../lib/fitImageToArea';

  @Component({
    inheritAttrs: false,
    directives: {
      resize
    },
    components: {
      IonImageViewer
    }
  })
  export default class ImageLoader extends Vue {
    $refs: any;

    @Prop()
    src!: string | null;
    @Prop({ default: () => ({zoom:1, xOffset: 0, yOffset: 0}) })
    imagePosition!: any;
    @Prop()
    imageFitParams!: any;
    @Prop()
    imageStyle!: any;

    containerWidth = 500;
    containerHeight = 500;
    ionImage: IonImage | null = null;
    ionImageIsLoading = false;

    created() {
      const ignoredPromise = this.updateIonImage();
    }
    mounted() {
      this.onResize();
    }
    onResize() {
      this.containerWidth = this.$refs.container.clientWidth;
      this.containerHeight = this.$refs.container.clientHeight;
    }

    @Watch('src')
    async updateIonImage() {
      // Keep track of which image is loading so that this can bail if src changes before the download finishes
      const newUrl = this.src;

      if (newUrl != null) {
        this.ionImageIsLoading = true;
        const png = await loadPngFromUrl((config.imageStorage || '') + newUrl);

        if (newUrl === this.src) {
          this.ionImage = processIonImage(png);
          this.ionImageIsLoading = false;
        }
      }
    }

    get imageFit(): FitImageToAreaResult {
      return fitImageToArea({
        imageWidth: this.ionImage ? this.ionImage.width : this.containerWidth,
        imageHeight: this.ionImage ? this.ionImage.height : this.containerHeight,
        areaWidth: this.containerWidth,
        areaHeight: this.containerHeight,
        ...this.imageFitParams,
      });
    }

    @Watch('imageFit')
    emitRedrawEvent() {
      this.$emit('redraw', {
        width: this.imageFit.areaWidth,
        height: this.imageFit.areaHeight,
        naturalWidth: this.ionImage ? this.ionImage.width : 0,
        naturalHeight: this.ionImage ? this.ionImage.height : 0,
      });
    }
  }
</script>
