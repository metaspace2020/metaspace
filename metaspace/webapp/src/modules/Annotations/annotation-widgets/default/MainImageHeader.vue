<template>
  <span
    slot="title"
    class="w-full"
  >
    <span>
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
        <ion-image-settings @scaleBarColorChange="onScaleBarColorChange" />
        <button
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
        <img src="../../../../assets/microscope-icon.png">
      </button>
    </div>
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

    @Prop({ required: true, type: Function })
    resetViewport!: Function;

    @Prop({ required: true, type: Function })
    toggleOpticalImage!: Function;

    @Prop({ required: true, type: Boolean })
    isActive!: boolean

    get multiImageFlag() {
      return config.features.multiple_ion_images
    }

    onScaleBarColorChange(color: string | null) {
      this.$emit('scaleBarColorChange', color)
    }
}
</script>

<style scoped>
.inactive {
  opacity: 0.3;
}
</style>
