<template>
<div class="main-ion-image-container">
    <div class="main-ion-image-container-row1">
        <image-loader :src="annotation.isotopeImages[0].url"
                      :colormap="colormap"
                      :max-height=500
                      ref="imageLoader"
                      scrollBlock
                      style="overflow: hidden"
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
                        :value="opacity"
                        @input="onOpacityInput"
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

    @Prop({required: true})
    annotation!: any
    @Prop({required: true, type: String})
    colormap!: string
    @Prop({required: true, type: String})
    colormapName!: string
    @Prop({required: true, type: Number})
    opacity!: number
    @Prop({required: true})
    imageLoaderSettings!: any
    @Prop({required: true, type: Function})
    onImageMove!: Function
    @Prop({required: true, type: Function})
    onImageZoom!: Function


    get colorbarDirection(): string {
      return this.colormap[0] == '-' ? 'bottom' : 'top';
    }

    saveImage(event: any): void {
      let node = this.$refs.imageLoader.getParent(),
        {imgWidth, imgHeight} = this.$refs.imageLoader.getScaledImageSize();

      domtoimage
        .toBlob(node, {
          width: imgWidth >= node.clientWidth ? node.clientWidth : imgWidth,
          height:  imgHeight >= node.clientHeight ? node.clientHeight : imgHeight
        })
        .then(blob => {
          saveAs(blob, `${this.annotation.id}.png`);
        })
    }

  get browserSupportsDomToImage(): boolean {
      return window.navigator.userAgent.includes('Chrome');
    }

    onOpacityInput(val: number): void {
      this.$emit('opacityInput', val);
    }
}
</script>

<style>
.main-ion-image-container {
    display: flex;
    flex-direction: column;
}

.main-ion-image-container-row1 {
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
