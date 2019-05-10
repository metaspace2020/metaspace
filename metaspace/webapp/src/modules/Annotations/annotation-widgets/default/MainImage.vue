<template>
<div class="main-ion-image-container">
    <div class="main-ion-image-container-row1">
        <div class="image-viewer-container" ref="imageViewerContainer" v-resize="onResize">
            <ion-image-viewer
              :ionImage="ionImage"
              :isLoading="ionImageIsLoading"
              :colormap="colormap"
              :pixelSizeX="pixelSizeX"
              :pixelSizeY="pixelSizeY"
              :showScaleBar="showScaleBar"
              :scaleBarColor="scaleBarColor"
              :width="imageViewerWidth"
              :height="imageViewerHeight"
              :zoom="imageLoaderSettings.imagePosition.zoom * imageFit.imageZoom"
              :minZoom="imageFit.imageZoom / 2"
              :maxZoom="imageFit.imageZoom * 10"
              :xOffset="imageLoaderSettings.imagePosition.xOffset"
              :yOffset="imageLoaderSettings.imagePosition.yOffset"
              ref="imageLoader"
              scrollBlock
              class="image-loader"
              v-bind="imageLoaderSettings"
              @move="handleImageMove"
            />
        </div>

        <div class="colorbar-container">
            <div v-if="imageLoaderSettings.opticalSrc">
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
import resize from 'vue-resize-directive';
import {Component, Prop, Watch} from 'vue-property-decorator';
import { saveAs } from 'file-saver';
import Colorbar from './Colorbar.vue';
import IonImageViewer from '../../../../components/IonImageViewer.vue';
import domtoimage from 'dom-to-image-google-font-issue';
import {IonImage, loadPngFromUrl, processIonImage} from '../../../../lib/ionImageRendering';
import {get} from 'lodash-es';
import fitImageToArea, {FitImageToAreaResult} from '../../../../lib/fitImageToArea';
import reportError from '../../../../lib/reportError';
import {inv} from 'numeric';


@Component({
    name: 'main-image',
    directives: {
        resize
    },
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
    @Prop({type: Number})
    pixelSizeX!: Number
    @Prop({type: Number})
    pixelSizeY!: Number
    @Prop({type: Boolean})
    showScaleBar!: Boolean
    @Prop({type: String})
    scaleBarColor!: String

    ionImageUrl: string | null = null;
    ionImage: IonImage | null = null;
    ionImageIsLoading = false;
    imageViewerWidth: number = 500;
    imageViewerHeight: number = 500;

    created() {
        const ignoredPromise = this.updateIonImage();
    }
    mounted() {
        this.imageViewerWidth = this.$refs.imageViewerContainer.clientWidth;
    }
    onResize() {
        this.imageViewerWidth = this.$refs.imageViewerContainer.clientWidth;
        this.imageViewerHeight = Math.min(Math.max(window.innerHeight - 500, 500), 1000);
    }

    @Watch('annotation')
    async updateIonImage() {
        const isotopeImage = get(this.annotation, 'isotopeImages[0]');
        const newUrl = isotopeImage != null ? isotopeImage.url : null;
        if (newUrl != null && newUrl !== this.ionImageUrl) {
            this.ionImageUrl = newUrl;
            this.ionImageIsLoading = true;
            try {
                const png = await loadPngFromUrl(newUrl);
                if (newUrl === this.ionImageUrl) {
                    const { minIntensity, maxIntensity } = isotopeImage;
                    this.ionImage = processIonImage(png, minIntensity, maxIntensity);
                    this.ionImageIsLoading = false;
                }
            } catch (err) {
                reportError(err, null);
                if (newUrl === this.ionImageUrl) {
                    this.ionImage = null;
                    this.ionImageIsLoading = false;
                }
            }
        }
    }

    get colorbarDirection(): string {
      return this.colormap[0] == '-' ? 'bottom' : 'top';
    }
    get imageFit(): FitImageToAreaResult {
        const {width=500, height=500} = this.ionImage || {};
        return fitImageToArea({
            imageWidth: width,
            imageHeight: height,
            areaWidth: this.imageViewerWidth,
            areaHeight: this.imageViewerHeight,
        });
    }

    async saveImage() {
        const node = this.$refs.imageViewerContainer;
        const blob = await domtoimage.toBlob(node, {
            width: node.clientWidth,
            height: node.clientHeight,
        });
        saveAs(blob, `${this.annotation.id}.png`);
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

    handleImageMove({zoom, xOffset, yOffset}: any) {
        this.onImageMove({
            zoom: zoom / this.imageFit.imageZoom,
            xOffset,
            yOffset,
        });
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

.image-viewer-container {
    flex: 1 1 auto;
    max-width: 100%;
    overflow: hidden;
}

.colorbar-container {
    display: flex;
    flex:none;
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
