<template v-slot:title>
  <span class="w-full">
    <span v-if="!hideOptions && !hideTitle"> Image viewer </span>
    <div class="flex items-center pr-4 cursor-default" @click.stop>
      <el-popover placement="bottom" trigger="click">
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
        <template #reference>
          <button v-if="!hideOptions" class="button-reset av-icon-button" @click="$event.stopPropagation()">
            <el-icon
              class="el-icon-setting"
              style="font-size: 20px; vertical-align: middle"
              data-feature-anchor="ion-image-settings"
              ><Setting
            /></el-icon>
          </button>
        </template>
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
        <div v-if="isActive" class="roi-container">
          <roi-settings :annotation="annotation" />
        </div>
      </fade-transition>
      <button
        v-if="hasOpticalImage"
        class="button-reset av-icon-button"
        :class="showOpticalImage ? '' : 'inactive'"
        title="Show/hide optical image"
        @click="toggleOpticalImage"
      >
        <img class="setting-icon" src="../../../../assets/microscope-icon.png" />
      </button>
    </div>
    <fade-transition v-if="isNormalized">
      <div class="norm-badge">TIC normalized</div>
    </fade-transition>
    <fade-transition v-if="multiImageFlag" class="ml-auto">
      <MenuButtons v-if="isActive" />
    </fade-transition>
  </span>
</template>

<script lang="ts">
import { defineComponent, computed, defineAsyncComponent } from 'vue'
import { useStore } from 'vuex'
import IonImageSettings from './IonImageSettings.vue'
import { MenuButtons } from '../../../ImageViewer'
import FadeTransition from '../../../../components/FadeTransition'
import RoiSettings from '../../../../components/RoiSettings'
import config from '../../../../lib/config'
import { Setting } from '@element-plus/icons-vue'
import { ElIcon } from '../../../../lib/element-plus'

const AspectRatioIcon = defineAsyncComponent(() => import('../../../../assets/inline/material/aspect-ratio.svg'))

export default defineComponent({
  name: 'MainImageHeader',
  components: {
    IonImageSettings,
    MenuButtons,
    AspectRatioIcon,
    FadeTransition,
    RoiSettings,
    Setting,
    ElIcon,
  },
  props: {
    hasOpticalImage: { type: Boolean, required: true },
    showOpticalImage: { type: Boolean, required: true },
    annotation: { type: Object, default: () => ({}) },
    colormap: { type: String, default: '' },
    lockedTemplate: { type: String, default: '' },
    scaleType: { type: String, default: '' },
    lockTemplateOptions: { type: Array, default: () => [] },
    resetViewport: { type: Function, required: true },
    toggleOpticalImage: { type: Function, required: true },
    isActive: { type: Boolean, required: true },
    showNormalizedBadge: { type: Boolean, default: false },
    hideOptions: { type: Boolean, default: false },
    hideNormalization: { type: Boolean, default: () => !config.features.tic },
    showIntensityTemplate: { type: Boolean, default: false },
    hideTitle: { type: Boolean, default: false },
  },
  setup(props, { emit }) {
    const store = useStore()
    const isNormalized = computed(() => {
      return props.showNormalizedBadge || (store.getters.settings.annotationView.normalization && props.isActive)
    })

    const showRoi = computed(() => config.features.roi)
    const multiImageFlag = computed(() => config.features.multiple_ion_images)

    // Event handlers
    const onScaleBarColorChange = (color) => emit('scaleBarColorChange', color)
    const onTemplateChange = (dsId) => emit('templateChange', dsId)
    const onColormapChange = (color) => emit('colormapChange', color)
    const onScaleTypeChange = (scaleType) => emit('scaleTypeChange', scaleType)
    const onNormalizationChange = (value) => emit('normalizationChange', value)

    return {
      isNormalized,
      showRoi,
      multiImageFlag,
      onScaleBarColorChange,
      onTemplateChange,
      onColormapChange,
      onScaleTypeChange,
      onNormalizationChange,
    }
  },
})
</script>

<style scoped>
.inactive {
  opacity: 0.3;
}

.roi-container {
  margin-left: 16px;
}

.norm-badge {
  background: rgba(0, 0, 0, 0.3);
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
  bottom: 10px;
}

.norm-info {
  max-width: 250px;
  text-align: left;
}
</style>
