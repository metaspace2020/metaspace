<template>
  <span slot="title">
    <span>
      m/z image
    </span>
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
      <!-- https://material.io/resources/icons/?icon=aspect_ratio&style=round -->
      <svg
        class="fill-current text-gray-900"
        xmlns="http://www.w3.org/2000/svg"
        height="24"
        viewBox="0 0 24 24"
        width="24"
      >
        <path
          d="M0 0h24v24H0V0z"
          fill="none"
        />
        <!-- eslint-disable-next-line vue/max-len -->
        <path d="M18 12c-.55 0-1 .45-1 1v2h-2c-.55 0-1 .45-1 1s.45 1 1 1h3c.55 0 1-.45 1-1v-3c0-.55-.45-1-1-1zM7 9h2c.55 0 1-.45 1-1s-.45-1-1-1H6c-.55 0-1 .45-1 1v3c0 .55.45 1 1 1s1-.45 1-1V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 16.01H4c-.55 0-1-.45-1-1V5.99c0-.55.45-1 1-1h16c.55 0 1 .45 1 1v12.02c0 .55-.45 1-1 1z" />
      </svg>
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
    <MenuButtons />
  </span>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import IonImageSettings from './IonImageSettings.vue'
import MenuButtons from '../MenuButtons'

interface colorObjType {
  code: string,
  colorName: string
}

@Component({
  name: 'main-image-header',
  components: { IonImageSettings, MenuButtons },
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
