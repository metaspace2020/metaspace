<template>
  <ion-image-viewer
    ref="imageLoader"
    :ionImage="ionImage"
    :isLoading="ionImageIsLoading"
    v-bind="$attrs"
    v-on="$listeners"
  />
</template>

<script lang="ts">
  import Vue from 'vue';
  import config from '../config';
  import {Component, Prop, Watch} from 'vue-property-decorator';
  import IonImageViewer from './IonImageViewer.vue';
  import {IonImage, loadPngFromUrl, processIonImage} from '../lib/ionImageRendering';

  @Component({
    inheritAttrs: false,
    components: {
      IonImageViewer
    }
  })
  export default class ImageLoader extends Vue {
    @Prop()
    src!: string | null;

    ionImage: IonImage | null = null;
    ionImageIsLoading = false;

    created() {
      const ignoredPromise = this.updateIonImage();
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
  }
</script>
