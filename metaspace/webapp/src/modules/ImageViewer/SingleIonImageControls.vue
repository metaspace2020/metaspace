<template>
  <overlay class="pb-0">
    <el-popover
      class="block"
      placement="bottom"
      popper-class="w-full max-w-measure-1 text-left text-sm leading-5"
      trigger="manual"
      :value="clippingNotice.visible"
      :visible-arrow="false"
      :disabled="popupsDisabled"
      @after-leave="clippingNotice.type = null"
    >
      <ion-intensity-slider
        slot="reference"
        :model="state"
        :color-bar="colorBar.value"
        :intensity="intensity.value"
        :scale-range="scaleRange.value"
        @thumb-start="popupsDisabled = true"
        @thumb-stop="popupsDisabled = false"
        @popover="toggleClippingNotice"
      />
      <clipping-notice
        :type="clippingNotice.type"
        :intensity="intensity.value"
        :is-normalized="isNormalized"
      />
    </el-popover>
  </overlay>
</template>
<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api'

import Overlay from './Overlay.vue'
import IonIntensitySlider from './IonIntensitySlider.vue'
import ClippingNotice from './ClippingNotice.vue'

import useClippingNotice from './useClippingNotice'

export default defineComponent({
  props: {
    state: Object,
    intensity: Object,
    colorBar: Object,
    scaleRange: Object,
    isNormalized: Boolean,
  },
  components: {
    Overlay,
    IonIntensitySlider,
    ClippingNotice,
  },
  setup() {
    const { clippingNotice, toggleClippingNotice } = useClippingNotice()
    return {
      clippingNotice,
      toggleClippingNotice,
      popupsDisabled: ref(false),
    }
  },
})
</script>
