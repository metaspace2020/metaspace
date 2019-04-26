<template>
<div class="main-ion-image-container">
    <div class="main-ion-image-container-row1">
        <ion-image-viewer
          :ionImage="ionImage"
          :isLoading="ionImageIsLoading"
          :colormap="colormap"
          :pixelSizeX="pixelSizeX"
          :pixelSizeY="pixelSizeY"
          :disableScaleBar="disableScaleBar"
          :scaleBarColor="scaleBarColor"
          ref="imageLoader"
          scrollBlock
          class="image-loader"
          v-bind="imageLoaderSettings"
          @zoom="onImageZoom"
          @move="onImageMove">
        </ion-image-viewer>

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

            <el-tooltip v-if="ionImage && ionImage.maxIntensity !== ionImage.clippedMaxIntensity" placement="left">
                <div>
                    <div style="color: red">{{ ionImage.clippedMaxIntensity.toExponential(2) }}</div>
                </div>
                <div slot="content">
                    Hot-spot removal has been applied to this image. <br/>
                    Pixel intensities above the 99th percentile, {{ ionImage.clippedMaxIntensity.toExponential(2) }},
                    have been reduced to {{ ionImage.clippedMaxIntensity.toExponential(2) }}. <br/>
                    The highest intensity before hot-spot removal was {{ ionImage.maxIntensity.toExponential(2) }}.
                </div>
            </el-tooltip>
            <div v-else>
                {{ ionImage && ionImage.maxIntensity.toExponential(2) }}
            </div>
            <colorbar style="width: 20px; height: 160px; align-self: center;"
                      :direction="colorbarDirection" :map="colormapName"
                      slot="reference">
            </colorbar>
            {{ ionImage && ionImage.minIntensity.toExponential(2) }}

            <div class="annot-view__image-download">
                <!-- see https://github.com/tsayen/dom-to-image/issues/155 -->
                <img src="../../../../assets/download-icon.png"
                     width="32px"
                     title="Save visible region in PNG format"
                     @click="saveImage"
                     v-if="browserSupportsDomToImage"/>
                <img src="../../../../assets/download-icon.png"
                     width="32px"
                     style="opacity: 0.3"
                     title="Your browser is not supported"
                     @click="showBrowserWarning"
                     v-else/>
            </div>
        </div>
    </div>
</div>
</template>

<script lang="ts">
import Vue from 'vue';
import {Component, Prop, Watch} from 'vue-property-decorator';
import { saveAs } from 'file-saver';
import Colorbar from './Colorbar.vue';
import IonImageViewer from '../../../../components/IonImageViewer.vue';
import domtoimage from 'dom-to-image-google-font-issue';
import {IonImage, loadPngFromUrl, processIonImage} from '../../../../lib/ionImageRendering';
import {get} from 'lodash-es';

@Component({
    name: 'main-image',
    components: {
        IonImageViewer,
        Colorbar,
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
    @Prop({type: Number})
    pixelSizeX!: Number
    @Prop({type: Number})
    pixelSizeY!: Number
    @Prop({type: Boolean})
    disableScaleBar!: Boolean
    @Prop({type: String})
    scaleBarColor!: String

    ionImageUrl: string | null = null;
    ionImage: IonImage | null = null;
    ionImageIsLoading = false;

    created() {
        const ignoredPromise = this.updateIonImage();
    }

    @Watch('annotation')
    async updateIonImage() {
        const isotopeImage = get(this.annotation, 'isotopeImages[0]');
        const newUrl = isotopeImage != null ? isotopeImage.url : null;
        if (newUrl != null && newUrl !== this.ionImageUrl) {
            this.ionImageUrl = newUrl;
            this.ionImageIsLoading = true;
            const png = await loadPngFromUrl(newUrl);
            if (newUrl === this.ionImageUrl) {
                const {minIntensity, maxIntensity} = isotopeImage;
                this.ionImage = processIonImage(png, minIntensity, maxIntensity);
                this.ionImageIsLoading = false;
            }
        }
    }

    get colorbarDirection(): string {
      return this.colormap[0] == '-' ? 'bottom' : 'top';
    }

    saveImage(event: any): void {
      let node = this.$refs.imageLoader.getParent(),
        {imgWidth, imgHeight} = this.$refs.imageLoader.getScaledImageSize();
      domtoimage
        .toBlob(node, {
          width: Math.min(imgWidth, node.clientWidth),
          height:  Math.min(imgHeight, node.clientHeight)
        })
        .then(blob  => {
          saveAs(blob, `${this.annotation.id}.png`);
        })
    }

    showBrowserWarning() {
      this.$alert('Due to technical limitations we are only able to support downloading layered and/or zoomed images' +
      ' on Chrome and Firefox. As a workaround, it is possible to get a copy of the raw ion image by right-clicking ' +
      'it and clicking "Save picture as", however this will not take into account your current zoom ' +
      'settings or show the optical image.');
    }

    get browserSupportsDomToImage(): boolean {
      return window.navigator.userAgent.includes('Chrome') ||
          window.navigator.userAgent.includes('Firefox');
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
