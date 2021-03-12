<template>
  <div
    v-if="intensity"
    ref="container"
    class="relative"
  >
    <range-slider
      :value="scaleRange"
      :style="style"
      :class="{ 'cursor-pointer': canFocus }"
      :tabindex="canFocus && !isDisabled ? 0 : null"
      :min="0"
      :max="1"
      :step="0.01"
      :disabled="isDisabled"
      @input="setScaleRange"
      @thumb-start="disableTooltips = true; $emit('thumb-start')"
      @thumb-stop="disableTooltips = false; $emit('thumb-stop')"
    />
    <div class="flex justify-between items-start h-6 leading-6 tracking-wide relative z-10">
      <ion-intensity
        :value="model.minIntensity"
        :intensities="intensity.min"
        :tooltip-disabled="disableTooltips"
        label="Minimum intensity"
        placeholder="min."
        @input="value => { model.minIntensity = value; setScaleRange([0, scaleRange[1]]) }"
        @lock="lockMin"
        @show-popover="$emit('popover', 'outlier-min')"
        @hide-popover="$emit('popover', null)"
      />
      <ion-intensity
        :value="model.maxIntensity"
        :intensities="intensity.max"
        :tooltip-disabled="disableTooltips"
        label="Maximum intensity"
        placeholder="max."
        @input="value => { model.maxIntensity = value; setScaleRange([scaleRange[0], 1]) }"
        @lock="lockMax"
        @show-popover="$emit('popover', intensity.min.status === 'CLIPPED' ? 'outlier-max' : 'hotspot-removal')"
        @hide-popover="$emit('popover', null)"
      />
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent, computed, ref } from '@vue/composition-api'

import IonIntensity from './IonIntensity.vue'

import { RangeSlider, THUMB_WIDTH } from '../../components/Slider'
import FadeTransition from '../../components/FadeTransition'

import { useIonImageSettings } from './ionImageState'
import { IonImageState, IonImageIntensity, ColorBar } from './ionImageState'

interface Props {
  model: IonImageState,
  intensity: {
    min: IonImageIntensity,
    max: IonImageIntensity,
  },
  colorBar: ColorBar,
  isDisabled: boolean
  scaleRange: [number, number]
}

export default defineComponent<Props>({
  props: {
    id: String,
    colorBar: Object,
    intensity: Object,
    isDisabled: Boolean,
    model: Object,
    canFocus: Boolean,
    scaleRange: Array,
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
      setScaleRange(nextRange: [number, number]) {
        const { min, max } = props.intensity
        if (min.status === 'LOCKED') {
          settings.lockMinScale = nextRange[0]
        }
        if (max.status === 'LOCKED') {
          settings.lockMaxScale = nextRange[1]
        }
        props.model.scaleRange = nextRange
      },
      lockMin(value: number) {
        settings.lockMin = value
        settings.lockMinScale = 0
        props.model.scaleRange[0] = 0
      },
      lockMax(value: number) {
        settings.lockMax = value
        settings.lockMaxScale = 1
        props.model.scaleRange[1] = 1
      },
      disableTooltips: ref(false),
      style: computed(() => {
        if (container.value) {
          const width = container.value.offsetWidth
          const [minScale, maxScale] = props.scaleRange
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
              `${minColor} ${maxStop}px / ${width - maxStop}px 100% linear-gradient(${maxColor},${maxColor}) no-repeat`,
            ].join(','),
          }
        }
      }),
    }
  },
})
</script>
