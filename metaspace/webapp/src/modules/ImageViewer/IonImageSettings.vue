<template>
  <overlay class="px-3">
    <p class="uppercase text-xs tracking-wider leading-6 m-0 flex justify-between">
      <span class="text-gray-700">
        OPACITY
      </span>
      <span>
        {{ state.value }}%
      </span>
    </p>
    <slider
      class="opacity-gradient"
      :value="state.value"
      @change="v => state.value = v"
    />
  </overlay>
</template>
<script lang="ts">
import { defineComponent, reactive } from '@vue/composition-api'

import Overlay from './Overlay.vue'
import { Slider } from '../../components/Slider'

export default defineComponent({
  components: {
    Overlay,
    Slider,
  },
  setup() {
    const state = reactive({
      value: 100,
    })
    return {
      state,
    }
  },
})
</script>
<style scoped>
.opacity-gradient {
  background-image:
    linear-gradient(to right, transparent 0%, theme('colors.primary') 66%),
    url('../../assets/checkerboard.png');
  background-repeat: none, repeat-x;
  background-size: 100%, 12px 12px;
}
p {
  margin-top: -6px; /* hacking */
}
</style>
