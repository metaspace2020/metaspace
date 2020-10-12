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
      :min-tooltip="tooltip(0)"
      :max-tooltip="tooltip(1)"
      @change="range => emit('change', range)"
    />
    <div class="flex justify-between leading-6 tracking-wide">
      <span>{{ model.minIntensity.toExponential(1) }}</span>
      <span>{{ model.maxIntensity.toExponential(1) }}</span>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'

import { RangeSlider } from '../../components/Slider'
import { IonImageState } from './ionImageState'

interface Props {
  model: IonImageState,
  colorBar: any,
  isDisabled: boolean
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
      tooltip: (quantileIndex: number) => {
        const { minIntensity, maxIntensity, quantileRange } = props.model
        return (
          minIntensity + ((maxIntensity - minIntensity) * quantileRange[quantileIndex])
        ).toExponential(1)
      },
      emit,
    }
  },
})
</script>
