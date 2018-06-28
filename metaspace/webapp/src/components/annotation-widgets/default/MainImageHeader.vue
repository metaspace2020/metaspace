<template>
<span slot="title">
    <span style="padding-right: 20px">
        m/z image
    </span>

    <el-popover placement="left" trigger="click">
        <ion-image-settings></ion-image-settings>

        <div slot="reference" @click="$event.stopPropagation()">
        <i class="el-icon-setting" style="font-size: 20px; vertical-align: middle;"></i>
        </div>
    </el-popover>

    <span>
        <img class="reset-image-icon"
            src="../../../assets/reset-image-icon.png"
            title="Reset image zoom and offsets"
            @click="resetViewport"/>
    </span>

    <span v-if="imageLoaderSettings.opticalImageUrl">
        <img class="show-optical-image-icon"
            :class="imageLoaderSettings.showOpticalImage ? '' : 'png-icon-disabled'"
            src="../../../assets/microscope-icon.png"
            title="Show/hide optical image"
            @click="toggleOpticalImage"/>
    </span>
</span>
</template>

<script lang="ts">
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';

import IonImageSettings from '../../IonImageSettings.vue';

@Component({
    name: 'main-image',
    components: { IonImageSettings }
})
export default class MainImageHeader extends Vue {
    @Prop()
    imageLoaderSettings: any
    @Prop({required: true, type: Function})
    resetViewport!: Function
    @Prop({required: true, type: Function})
    toggleOpticalImage!: Function
}
</script>

<style>
.reset-image-icon, .show-optical-image-icon {
    width: 24px;
    padding-left: 20px;
    vertical-align: middle;
    cursor: pointer;
}

.png-icon-disabled {
    opacity: 0.3;
}
</style>
