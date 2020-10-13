<template>
  <div
    v-if="model && colorBar"
    class="relative"
  >
    <range-slider
      :style="colorBar.background"
      :min-color="colorBar.minColor"
      :max-color="colorBar.maxColor"
      :min="0"
      :max="1"
      :step="0.01"
      :value="model.quantileRange"
      :disabled="isDisabled"
      :min-tooltip="minTooltip"
      :max-tooltip="maxTooltip"
      @change="range => emit('change', range)"
    />
    <div class="flex justify-between leading-6 tracking-wide">
      <span>{{ model.minIntensity.toExponential(1) }}</span>
      <span>{{ model.maxIntensity.toExponential(1) }}</span>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, computed } from '@vue/composition-api'

import { RangeSlider } from '../../components/Slider'
import { IonImageState } from './ionImageState'

interface Props {
  model: IonImageState,
  colorBar: any,
  isDisabled: boolean
}

const getTooltip = (quantile: number, min: number, max: number) => {
  return (min + ((max - min) * quantile)).toExponential(1)
}

export default defineComponent<Props>({
  props: {
    model: Object,
    colorBar: Object,
    isDisabled: Boolean,
  },
  components: {
    RangeSlider,
  },
  setup(props, { emit }) {
    return {
      minTooltip: computed(() => {
        const { minIntensity, maxIntensity, quantileRange } = props.model
        return getTooltip(quantileRange[0], minIntensity, maxIntensity)
      }),
      maxTooltip: computed(() => {
        const { minIntensity, maxIntensity, quantileRange } = props.model
        return getTooltip(quantileRange[1], minIntensity, maxIntensity)
      }),
      emit,
    }
  },
})
</script>
