<template>
  <div
    v-if="layer && colorBar"
    class="relative"
  >
    <range-slider
      :style="colorBar.background"
      :min-color="colorBar.minColor"
      :max-color="colorBar.maxColor"
      :min="0"
      :max="1"
      :step="0.01"
      :value="layer.quantileRange"
      :disabled="!layer.visible"
      :min-tooltip="tooltip(0)"
      :max-tooltip="tooltip(1)"
      @change="range => emit('change', layer.id, range)"
    />
    <div class="flex justify-between leading-6 tracking-wide">
      <span>{{ layer.minIntensity.toExponential(1) }}</span>
      <span>{{ layer.maxIntensity.toExponential(1) }}</span>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'

import RangeSlider from '../../components/RangeSlider.vue'

export default defineComponent({
  props: {
    layer: Object,
    colorBar: Object,
  },
  components: {
    RangeSlider,
  },
  setup(props, { emit }) {
    return {
      tooltip: (quantileIndex: number) => {
        const { minIntensity, maxIntensity, quantileRange } = props.layer as any
        return (
          minIntensity + ((maxIntensity - minIntensity) * quantileRange[quantileIndex])
        ).toExponential(1)
      },
      emit,
    }
  },
})
</script>
