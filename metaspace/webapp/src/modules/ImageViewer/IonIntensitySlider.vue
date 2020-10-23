<template>
  <div
    ref="container"
    class="relative"
  >
    <range-slider
      :style="style"
      :class="{ 'cursor-pointer': canFocus }"
      :tabindex="canFocus ? 0 : null"
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
      @track-click="emit('track-click')"
    />
    <div
      v-if="intensity"
      class="flex justify-between leading-6 tracking-wide"
    >
      <span>
        {{ intensity.min.toExponential(1) }}
      </span>
      <el-tooltip
        v-if="intensity.maxClipped"
        placement="bottom-end"
      >
        <span class="font-medium text-red-700">
          {{ intensity.max.toExponential(1) }}
        </span>
        <div
          slot="content"
          class="text-sm leading-5 max-w-measure-3"
        >
          <b>Hot-spot removal has been applied to this image.</b> <br>
          Pixel intensities above the {{ intensity.maxPercentile }}th percentile, {{ intensity.max.toExponential(1) }},
          have been reduced to {{ intensity.max.toExponential(1) }}.
          The highest intensity before hot-spot removal was {{ intensity.imageMax.toExponential(1) }}.
        </div>
      </el-tooltip>
      <span v-else>
        {{ intensity.max.toExponential(1) }}
      </span>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, computed, ref, Ref } from '@vue/composition-api'

import { RangeSlider, THUMB_WIDTH } from '../../components/Slider'
import { IonImageState, IonImageIntensity, ColorBar } from './ionImageState'

interface Props {
  model: IonImageState,
  intensity: IonImageIntensity,
  colorBar: ColorBar,
  isDisabled: boolean
}

const getTooltip = (quantile: number, min: number, max: number) => {
  return (min + ((max - min) * quantile)).toExponential(1)
}

export default defineComponent<Props>({
  props: {
    colorBar: Object,
    intensity: Object,
    isDisabled: Boolean,
    model: Object,
    canFocus: Boolean,
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
              `0px / ${minStop}px 100% linear-gradient(${minColor},${minColor}) no-repeat`,
              `${minStop}px / ${maxStop - minStop}px 100% url(${img}) repeat-y`,
              `#fff ${maxStop}px / ${width - maxStop}px 100% linear-gradient(${maxColor},${maxColor}) no-repeat`,
            ].join(','),
          }
        }
      }),
      minTooltip: computed(() => {
        const { quantileRange } = props.model
        if (props.intensity) {
          return getTooltip(quantileRange[0], props.intensity.min, props.intensity.max)
        }
      }),
      maxTooltip: computed(() => {
        const { quantileRange } = props.model
        if (props.intensity) {
          return getTooltip(quantileRange[1], props.intensity.min, props.intensity.max)
        }
      }),
    }
  },
})
</script>
