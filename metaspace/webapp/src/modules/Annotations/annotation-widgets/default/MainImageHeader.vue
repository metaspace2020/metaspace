<template>
<span slot="title">
    <span style="padding-right: 20px">
        m/z image
    </span>

    <el-popover placement="bottom" trigger="click">
        <ion-image-settings></ion-image-settings>
        <div slot="reference" @click="$event.stopPropagation()">
        <i class="el-icon-setting" style="font-size: 20px; vertical-align: middle;"></i>
        </div>
    </el-popover>

    <span>
        <img class="reset-image-icon"
            src="../../../../assets/reset-image-icon.png"
            title="Reset image zoom and offsets"
            @click="resetViewport"/>
    </span>

    <span v-if="imageLoaderSettings.opticalImageUrl">
        <img class="show-optical-image-icon"
            :class="imageLoaderSettings.showOpticalImage ? '' : 'png-icon-disabled'"
            src="../../../../assets/microscope-icon.png"
            title="Show/hide optical image"
            @click="toggleOpticalImage"/>
    </span>

    <span>

    <el-popover placement="bottom" trigger="click">
      <palette @colorInput="colorObj=>updateColor(colorObj)" @toggleScaleBar="toggleScaleBar"></palette>
      <div slot="reference" @click="$event.stopPropagation()">
        <img class="show-scale-bar-icon"
             :class="!imageLoaderSettings.disableScaleBar ? '' : 'png-icon-disabled'"
             src="../../../../assets/scale_bar.png"
             title="Show scale bar options"/>
      </div>
    </el-popover>

    </span>
</span>
</template>

<script lang="ts">
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import Palette from './Palette.vue'
import IonImageSettings from './IonImageSettings.vue';

interface colorObjType {
  code: string,
  colorName: string
}

@Component({
    name: 'main-image',
    components: { IonImageSettings, Palette }
})
export default class MainImageHeader extends Vue {
    @Prop()
    imageLoaderSettings: any
    @Prop({required: true, type: Function})
    resetViewport!: Function
    @Prop({required: true, type: Function})
    toggleOpticalImage!: Function
    @Prop({required: true, type: Function})
    toggleScaleBar!: Function

    updateColor(colorObj: colorObjType) {
      this.$emit('colorInput', colorObj)
    }
}
</script>

<style>
.reset-image-icon, .show-optical-image-icon, .show-scale-bar-icon {
    width: 24px;
    padding-left: 20px;
    vertical-align: middle;
    cursor: pointer;
}

.png-icon-disabled {
    opacity: 0.3;
}
</style>
