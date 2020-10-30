<template>
  <div
    ref="container"
    class="relative"
  >
    <range-slider
      :style="style"
      :class="{ 'cursor-pointer': canFocus }"
      :tabindex="canFocus && !isDisabled ? 0 : null"
      :min="0"
      :max="1"
      :step="0.01"
      :value="model.scaleRange"
      :disabled="isDisabled"
      :min-tooltip="values.tooltipMin"
      :max-tooltip="values.tooltipMax"
      @change="range => emit('change', range)"
      @thumb-start="emit('thumb-start')"
      @thumb-stop="emit('thumb-stop')"
      @track-click="emit('track-click')"
    />
    <div
      v-if="intensity"
      class="flex justify-between leading-6 tracking-wide"
    >
      <clipping-tooltip
        v-if="intensity.isMinClipped"
        :id="id + '-min'"
        clipping-type="outlier-min"
        placement="bottom-start"
        :clipped-intensity="values.rangeMin"
        :original-intensity="values.imageMin"
      />
      <span
        v-else-if="intensity.isMinLocked"
        class="cursor-help font-medium text-blue-700"
        title="Locked intensity"
      >
        {{ values.rangeMin }}
      </span>
      <span v-else>
        {{ values.rangeMin }}
      </span>
      <clipping-tooltip
        v-if="intensity.isMaxClipped"
        :id="id + '-max'"
        placement="bottom-end"
        :clipping-type="intensity.isMinClipped ? 'outlier-max' : 'hotspot-removal'"
        :clipped-intensity="values.rangeMax"
        :original-intensity="values.imageMax"
      />
      <span
        v-else-if="intensity.isMaxLocked"
        class="cursor-help font-medium text-blue-700"
        title="Locked intensity"
      >
        {{ values.rangeMax }}
      </span>
      <span v-else>
        {{ values.rangeMax }}
      </span>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, computed, ref, watch } from '@vue/composition-api'

import ClippingTooltip from './ClippingTooltip.vue'
import { RangeSlider, THUMB_WIDTH } from '../../components/Slider'

import { IonImageState, IonImageIntensity, ColorBar, useIonImageSettings } from './ionImageState'

interface Props {
  model: IonImageState,
  intensity: IonImageIntensity,
  colorBar: ColorBar,
  isDisabled: boolean
}

export default defineComponent<Props>({
  props: {
    id: String,
    colorBar: Object,
    intensity: Object,
    isDisabled: Boolean,
    model: Object,
    canFocus: Boolean,
  },
  components: {
    RangeSlider,
    ClippingTooltip,
  },
  setup(props, { emit }) {
    const { settings } = useIonImageSettings()

    const container = ref<HTMLElement>()

    return {
      container,
      emit,
      settings,
      values: computed(() => ({
        rangeMin: props.intensity.clippedMin.toExponential(1),
        rangeMax: props.intensity.clippedMax.toExponential(1),
        tooltipMin: props.intensity.scaledMin.toExponential(1),
        tooltipMax: props.intensity.scaledMax.toExponential(1),
        imageMin: props.intensity.imageMin.toExponential(1),
        imageMax: props.intensity.imageMax.toExponential(1),
      })),
      style: computed(() => {
        if (container.value) {
          const width = container.value.offsetWidth
          const [minScale, maxScale] = props.model.scaleRange
          const { minColor, maxColor, gradient } = props.colorBar
          if (!gradient) {
            return null
          }
          const minStop = Math.ceil(THUMB_WIDTH + ((width - THUMB_WIDTH * 2) * minScale))
          const maxStop = Math.ceil(THUMB_WIDTH + ((width - THUMB_WIDTH * 2) * maxScale))
          return {
            background: [
              `0px / ${minStop}px 100% linear-gradient(${minColor},${minColor}) no-repeat`,
              `${minStop}px / ${maxStop - minStop}px 100% ${gradient} repeat-y`,
              `#fff ${maxStop}px / ${width - maxStop}px 100% linear-gradient(${maxColor},${maxColor}) no-repeat`,
            ].join(','),
          }
        }
      }),
    }
  },
})
</script>
