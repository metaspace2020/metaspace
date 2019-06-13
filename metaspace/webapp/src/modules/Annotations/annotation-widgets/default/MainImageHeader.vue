<template>
<span slot="title">
    <span style="padding-right: 20px">
        m/z image
    </span>

    <el-popover placement="bottom" trigger="click">
        <ion-image-settings @colorInput="updateColor" @toggleScaleBar="toggleScaleBar"></ion-image-settings>
        <div slot="reference" @click="$event.stopPropagation()">
        <i class="el-icon-setting"
           style="font-size: 20px; vertical-align: middle;"
           data-feature-anchor="ion-image-settings"
        />
        </div>
    </el-popover>

    <span>
        <img class="reset-image-icon"
            src="../../../../assets/reset-image-icon.png"
            title="Reset image zoom and offsets"
            @click="resetViewport"/>
    </span>

    <span v-if="hasOpticalImage">
        <img class="show-optical-image-icon"
            :class="showOpticalImage ? '' : 'png-icon-disabled'"
            src="../../../../assets/microscope-icon.png"
            title="Show/hide optical image"
            @click="toggleOpticalImage"/>
    </span>
</span>
</template>

<script lang="ts">
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import IonImageSettings from './IonImageSettings.vue';

interface colorObjType {
  code: string,
  colorName: string
}

@Component({
    name: 'main-image-header',
    components: { IonImageSettings }
})
export default class MainImageHeader extends Vue {
    @Prop({required: true, type: Boolean})
    hasOpticalImage!: boolean;
    @Prop({required: true, type: Boolean})
    showOpticalImage!: boolean;
    @Prop({required: true, type: Function})
    resetViewport!: Function;
    @Prop({required: true, type: Function})
    toggleOpticalImage!: Function;
    @Prop({required: true, type: Function})
    toggleScaleBar!: Function;

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
