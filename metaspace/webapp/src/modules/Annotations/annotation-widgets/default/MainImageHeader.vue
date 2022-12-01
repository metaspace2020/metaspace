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
      <fade-transition v-if="showRoi">
        <div
          v-if="isActive"
          class="roi-container"
        >
          <roi-settings
            :annotation="annotation"
          />
        </div>
      </fade-transition>
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
import RoiSettings from '../../../../components/RoiSettings'

import config from '../../../../lib/config'

interface colorObjType {
  code: string,
  colorName: string
}

@Component({
  name: 'main-image-header',
  components: {
    IonImageSettings,
    MenuButtons,
    AspectRatioIcon,
    FadeTransition,
    RoiSettings,
  },
})
export default class MainImageHeader extends Vue {
    @Prop({ required: true, type: Boolean })
    hasOpticalImage!: boolean;

    @Prop({ required: true, type: Boolean })
    showOpticalImage!: boolean;

    @Prop({ type: Object })
    annotation: string | undefined;

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
    showNormalizedBadge: boolean | undefined

    @Prop({ type: Boolean })
    hideOptions: boolean | undefined

    @Prop({ type: Boolean, default: () => !config.features.tic })
    hideNormalization: boolean | undefined

    @Prop({ type: Boolean })
    showIntensityTemplate: boolean | undefined

    @Prop({ type: Boolean })
    hideTitle: boolean | undefined

    get showRoi() {
      return config.features.roi
    }

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
}
</script>

<style scoped>
.inactive {
  opacity: 0.3;
}

.roi-container{
  margin-left: 16px;
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
  right: 50px;
  height: 25px;
}

.norm-info{
  max-width: 250px;
  text-align: left;
}
</style>
