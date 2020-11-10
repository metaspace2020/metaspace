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
      :min-tooltip="intensity.scaledMin.toExponential(1)"
      :max-tooltip="intensity.scaledMax.toExponential(1)"
      @change="range => $emit('change', range)"
      @thumb-start="disableTooltips = true; $emit('thumb-start')"
      @thumb-stop="disableTooltips = false; $emit('thumb-stop')"
      @track-click="$emit('track-click')"
    />
    <div
      v-if="intensity"
      class="flex justify-between items-center h-6 leading-6 tracking-wide relative z-10"
    >
      <ion-intensity
        v-model="model.minIntensity"
        :original-value="intensity.imageMin"
        :status="minStatus"
        :tooltip-disabled="disableTooltips"
        clipping-type="outlier-min"
        label="Minimum intensity"
        placeholder="min."
      />
      <ion-intensity
        v-model="model.maxIntensity"
        :original-value="intensity.imageMax"
        :status="maxStatus"
        :tooltip-disabled="disableTooltips"
        :clipping-type="minStatus === 'CLIPPED' ? 'outlier-max' : 'hotspot-removal'"
        label="Maximum intensity"
        placeholder="max."
      />
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, computed, ref, watch } from '@vue/composition-api'

import IonIntensity from './IonIntensity.vue'

import { RangeSlider, THUMB_WIDTH } from '../../components/Slider'
import FadeTransition from '../../components/FadeTransition'

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
    FadeTransition,
    IonIntensity,
  },
  setup(props) {
    const { settings } = useIonImageSettings()

    const container = ref<HTMLElement>()

    return {
      container,
      settings,
      minStatus: computed(() => {
        if (props.intensity.isMinLocked) {
          return 'LOCKED'
        } else if (props.intensity.isMinClipped) {
          return 'CLIPPED'
        }
      }),
      maxStatus: computed(() => {
        if (props.intensity.isMaxLocked) {
          return 'LOCKED'
        } else if (props.intensity.isMaxClipped) {
          return 'CLIPPED'
        }
      }),
      disableTooltips: ref(false),
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
