<template>
  <overlay
    class="text-xs tracking-wider"
  >
    <p class="leading-6 m-0 flex justify-between">
      <span class="text-gray-700 font-medium">
        {{ opacityLabel }}
      </span>
      <span>
        {{ percentage }}%
      </span>
    </p>
    <slider
      class="opacity-gradient"
      :value="percentage"
      :min="0"
      :max="100"
      :step="1"
      @input="emitOpacity"
    />
  </overlay>
</template>
<script lang="ts">
import { defineComponent, computed, ref } from '@vue/composition-api'

import Overlay from './Overlay.vue'
import { Slider } from '../../components/Slider'

export default defineComponent({
  components: {
    Overlay,
    Slider,
  },
  props: {
    opacity: { type: Number, required: true },
    label: { type: String, default: 'Opacity' },
  },
  setup(props, { emit }) {
    return {
      percentage: computed(() => Math.round(props.opacity * 100)),
      opacityLabel: computed(() => props.label),
      emitOpacity(value: number) {
        emit('opacity', value / 100)
      },
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
</style>
