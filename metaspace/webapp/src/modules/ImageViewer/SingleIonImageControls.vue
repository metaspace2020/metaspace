<template>
  <overlay class="pb-0">
    <ion-intensity-slider
      :model="state"
      :color-bar="colorBar.value"
      :intensity="intensity.value"
      :scale-range="scaleRange.value"
    />
  </overlay>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'

import Overlay from './Overlay.vue'
import IonIntensitySlider from './IonIntensitySlider.vue'

export default defineComponent({
  props: {
    state: Object,
    intensity: Object,
    colorBar: Object,
    scaleRange: Object,
  },
  components: {
    Overlay,
    IonIntensitySlider,
  },
})
</script>
