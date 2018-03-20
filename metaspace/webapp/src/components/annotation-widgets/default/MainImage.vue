<template>
<div class="main-ion-image-container">
    <image-loader :src="annotation.isotopeImages[0].url"
                  :colormap="colormap"
                  :max-height=500
                  ref="imageLoader"
                  v-bind="imageLoaderSettings"
                  @zoom="onImageZoom"
                  @move="onImageMove">
    </image-loader>

    <div class="colorbar-container">
        <div v-if="imageLoaderSettings.opticalImageUrl">
        Opacity:
        <el-slider
            vertical
            height="150px"
            v-model="opacity"
            :min=0
            :max=1
            :step=0.01
            style="margin: 10px 0px 30px 0px;">
        </el-slider>
        </div>

        {{ annotation.isotopeImages[0].maxIntensity.toExponential(2) }}
        <colorbar style="width: 20px; height: 160px; align-self: center;"
                  :direction="colorbarDirection" :map="colormapName"
                  slot="reference">
        </colorbar>
        {{ annotation.isotopeImages[0].minIntensity.toExponential(2) }}

        <div class="annot-view__image-download" v-if="browserSupportsDomToImage">
        <!-- see https://github.com/tsayen/dom-to-image/issues/155 -->
        <img src="../../../assets/download-icon.png"
             width="32px"
             title="Save visible region in PNG format"
             @click="saveImage"/>
        </div>
    </div>
</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import * as domtoimage from 'dom-to-image';
import { saveAs } from 'file-saver';

import Colorbar from '../../Colorbar.vue';
import ImageLoader from '../../ImageLoader.vue';

@Component({
    name: 'main-image',
    components: {
        ImageLoader,
        Colorbar
    }
})
export default class MainImage extends Vue {
    $refs: any

    @Prop()
    annotation: any
    @Prop()
    colormap: any
    @Prop()
    colormapName: any
    @Prop()
    opacity: number
    @Prop()
    imageLoaderSettings: any
    @Prop()
    onImageMove: Function
    @Prop()
    onImageZoom: Function

    get colorbarDirection(): string {
      return this.colormap[0] == '-' ? 'bottom' : 'top';
    }

    saveImage(event: any): void {
      let node = this.$refs.imageLoader.getContainer();

      domtoimage
        .toBlob(node, {
          width: this.$refs.imageLoader.imageWidth,
          height: this.$refs.imageLoader.imageHeight
        })
        .then(blob => {
          saveAs(blob, `${this.annotation.id}.png`);
        })
    }

    get browserSupportsDomToImage(): boolean {
      return window.navigator.userAgent.includes('Chrome');
    }
}
</script>

<style>
.main-ion-image-container {
    display: flex;
    flex-direction: row;
    justify-content: center;
}

.colorbar-container {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding-left: 10px;
    padding-bottom: 6px;
}

.annot-view__image-download {
    margin-top: 20px;
    cursor: pointer;
}
</style>
