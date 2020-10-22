<template>
  <overlay class="h-12 w-60">
    <ion-intensity-slider
      v-if="colorBar"
      :model="state"
      :color-bar="colorBar"
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
    colorBar: Object,
    updateIntensity: Function,
  },
  components: {
    Overlay,
    IonIntensitySlider,
  },
})
</script>
