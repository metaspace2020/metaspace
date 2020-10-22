<template>
  <div
    v-if="model && colorBar"
    ref="container"
    class="relative"
  >
    <range-slider
      :style="style"
      :min="0"
      :max="1"
      :step="0.01"
      :value="model.quantileRange"
      :disabled="isDisabled"
      :min-tooltip="minTooltip"
      :max-tooltip="maxTooltip"
      @change="range => emit('change', range)"
      @thumb-start="emit('thumb-start')"
      @thumb-stop="emit('thumb-stop')"
    />
    <div class="flex justify-between leading-6 tracking-wide">
      <span>{{ model.minIntensity.toExponential(1) }}</span>
      <span>{{ model.maxIntensity.toExponential(1) }}</span>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, computed, ref } from '@vue/composition-api'

import { RangeSlider, THUMB_WIDTH } from '../../components/Slider'
import { IonImageState } from './ionImageState'

interface Props {
  model: IonImageState,
  colorBar: {
    img: string,
    minColor: string,
    maxColor: string,
  },
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
    const container = ref<HTMLElement>()

    return {
      container,
      emit,
      style: computed(() => {
        if (container.value) {
          const width = container.value.offsetWidth
          const { quantileRange } = props.model
          const { minColor, maxColor, img } = props.colorBar
          if (!img) {
            return null
          }
          const nudge = THUMB_WIDTH
          const minStop = Math.ceil(width * quantileRange[0]) + nudge
          const maxStop = Math.floor(width * quantileRange[1]) - nudge
          return {
            background: [
              `0px / ${minStop}px linear-gradient(${minColor},${minColor}) no-repeat`,
              `${minStop}px / ${maxStop - minStop}px url(${img}) repeat-y`,
              `#fff ${maxStop}px / ${width - maxStop}px linear-gradient(${maxColor},${maxColor}) no-repeat`,
            ].join(','),
          }
        }
      }),
      minTooltip: computed(() => {
        const { minIntensity, maxIntensity, quantileRange } = props.model
        return getTooltip(quantileRange[0], minIntensity, maxIntensity)
      }),
      maxTooltip: computed(() => {
        const { minIntensity, maxIntensity, quantileRange } = props.model
        return getTooltip(quantileRange[1], minIntensity, maxIntensity)
      }),
    }
  },
})
</script>
