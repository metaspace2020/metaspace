<template>
  <overlay class="pb-0">
    <ion-intensity-slider
      :model="state"
      :color-bar="colorBar"
      :intensity="intensity"
      @change="updateIntensity"
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
    updateIntensity: Function,
  },
  components: {
    Overlay,
    IonIntensitySlider,
  },
})
</script>
