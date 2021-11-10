<template>
  <span
    slot="title"
    class="w-full"
  >
    <span v-if="!hideOptions && !hideTitle">
      Image viewer
    </span>
    <div
      class="flex items-center pr-4 cursor-default"
      @click.stop
    >
      <el-popover
        placement="bottom"
        trigger="click"
      >
        <ion-image-settings
          :hide-normalization="hideNormalization"
          :default-colormap="colormap"
          :default-scale-type="scaleType"
          :default-lock-template="lockedTemplate"
          :show-intensity-template="showIntensityTemplate"
          :lock-template-options="lockTemplateOptions"
          @colormapChange="onColormapChange"
          @scaleTypeChange="onScaleTypeChange"
          @scaleBarColorChange="onScaleBarColorChange"
          @normalizationChange="onNormalizationChange"
          @templateChange="onTemplateChange"
        />
        <button
          v-if="!hideOptions"
          slot="reference"
          class="button-reset av-icon-button"
          @click="$event.stopPropagation()"
        >
          <i
            class="el-icon-setting"
            style="font-size: 20px; vertical-align: middle;"
            data-feature-anchor="ion-image-settings"
          />
        </button>
      </el-popover>

      <button
        v-if="!hideOptions"
        class="button-reset av-icon-button"
        title="Reset image zoom and offsets"
        @click="resetViewport"
      >
        <AspectRatioIcon class="w-6 h-6 fill-current text-gray-900" />
      </button>
      <button
        v-if="hasOpticalImage"
        class="button-reset av-icon-button"
        :class="showOpticalImage ? '' : 'inactive'"
        title="Show/hide optical image"
        @click="toggleOpticalImage"
      >
        <img
          class="setting-icon"
          src="../../../../assets/microscope-icon.png"
        >
      </button>
    </div>
    <fade-transition v-if="isNormalized">
      <div
        class="norm-badge"
      >
        TIC normalized
      </div>
    </fade-transition>
    <fade-transition v-if="showRoi">
      <el-popover
        placement="bottom"
        width="200"
        trigger="click"
      >
        <div>
          <div
            v-for="roi in roiInfo"
            :key="roi.name"
          >
            {{ roi.name }}
          </div>
          <div>
          </div>
          <el-button
            class="button-reset h-9 rounded-lg flex items-center justify-center px-2 hover:bg-gray-100"
            icon="el-icon-add-location"
            @click="addRoi"
          >
            Add ROI
          </el-button>
        </div>
        <el-button
          slot="reference"
          class="roi-badge button-reset h-9 rounded-lg flex items-center justify-center px-2 hover:bg-gray-100"
          icon="el-icon-add-location"
          @click="openRoi"
        >
          Regions of interest
        </el-button>
      </el-popover>
    </fade-transition>

    <fade-transition v-if="multiImageFlag">
      <MenuButtons
        v-if="isActive"
        class="ml-auto"
      />
    </fade-transition>
  </span>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import IonImageSettings from './IonImageSettings.vue'
import { MenuButtons } from '../../../ImageViewer'
import FadeTransition from '../../../../components/FadeTransition'
import AspectRatioIcon from '../../../../assets/inline/material/aspect-ratio.svg'

import config from '../../../../lib/config'

interface colorObjType {
  code: string,
  colorName: string
}

const channels: any = {
  magenta: 'rgb(255, 0, 255)',
  green: 'rgb(0, 255, 0)',
  blue: 'rgb(0, 0, 255)',
  red: 'rgb(255, 0, 0)',
  yellow: 'rgb(255, 255, 0)',
  cyan: 'rgb(0, 255, 255)',
  orange: 'rgb(255, 128, 0)',
  violet: 'rgb(128, 0, 255)',
  white: 'rgb(255, 255, 255)',
}

@Component({
  name: 'main-image-header',
  components: {
    IonImageSettings,
    MenuButtons,
    AspectRatioIcon,
    FadeTransition,
  },
})
export default class MainImageHeader extends Vue {
    @Prop({ required: true, type: Boolean })
    hasOpticalImage!: boolean;

    @Prop({ required: true, type: Boolean })
    showOpticalImage!: boolean;

    @Prop({ type: String })
    colormap: string | undefined;

    @Prop({ type: String })
    lockedTemplate: string | undefined;

    @Prop({ type: String })
    scaleType: string | undefined;

    @Prop({ type: Array })
    lockTemplateOptions: any[] | undefined;

    @Prop({ required: true, type: Function })
    resetViewport!: Function;

    @Prop({ required: true, type: Function })
    toggleOpticalImage!: Function;

    @Prop({ required: true, type: Boolean })
    isActive!: boolean

    @Prop({ type: Boolean })
    showNormalizedBadge: boolean = false

    @Prop({ type: Boolean })
    hideOptions: boolean | undefined

    @Prop({ type: Boolean, default: () => !config.features.tic })
    hideNormalization: boolean | undefined

    @Prop({ type: Array, default: () => [] })
    roiInfo: any

    @Prop({ type: Boolean })
    showIntensityTemplate: boolean | undefined

    @Prop({ type: Boolean })
    showRoi: boolean | undefined

    @Prop({ type: Boolean })
    hideTitle: boolean | undefined

    get multiImageFlag() {
      return config.features.multiple_ion_images
    }

    get isNormalized() {
      return this.showNormalizedBadge || (this.$store.getters.settings.annotationView.normalization && this.isActive)
    }

    onScaleBarColorChange(color: string | null) {
      this.$emit('scaleBarColorChange', color)
    }

    onTemplateChange(dsId: string) {
      this.$emit('templateChange', dsId)
    }

    onColormapChange(color: string | null) {
      this.$emit('colormapChange', color)
    }

    onScaleTypeChange(scaleType: string | null) {
      this.$emit('scaleTypeChange', scaleType)
    }

    onNormalizationChange(value: boolean) {
      this.$emit('normalizationChange', value)
    }

    openRoi(e: any) {
      e.stopPropagation()
      e.preventDefault()
    }

    addRoi(e: any) {
      e.stopPropagation()
      e.preventDefault()
      const index = this.roiInfo.length
      const channel : any = Object.values(channels)[index]
      this.$emit('addRoi', {
        coordinates: [],
        color: channel.replace('rgb', 'rgba').replace(')', ', 0.4)'),
        strokeColor: channel,
        name: `ROI ${index + 1}`,
      })
    }
}
</script>

<style scoped>
.inactive {
  opacity: 0.3;
}

.roi-badge{
  padding: 0 5px;
  font-size: 14px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  right: 45px;
  height: 0;
}

.norm-badge{
  background: rgba(0,0,0,0.3);
  border-radius: 16px;
  color: white;
  padding: 0 5px;
  font-size: 11px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  right: 45px;
  height: 25px;
}

.norm-info{
  max-width: 250px;
  text-align: left;
}
</style>
