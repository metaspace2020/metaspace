<template>
  <div
    v-if="intensity"
    :key="componentKey"
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
        @input="updateMinIntensity"
        @lock="lockMin"
        @show-popover="$emit('popover', 'outlier-min')"
        @hide-popover="$emit('popover', null)"
      />
      <ion-intensity
        :reverse="true"
        :value="model.maxIntensity"
        :intensities="intensity.max"
        :tooltip-disabled="disableTooltips"
        label="Maximum intensity"
        placeholder="max."
        @input="updateMaxIntensity"
        @lock="lockMax"
        @show-popover="$emit('popover', intensity.min.status === 'CLIPPED' ? 'outlier-max' : 'hotspot-removal')"
        @hide-popover="$emit('popover', null)"
      />
    </div>
  </div>
</template>
<script lang="ts">
import {defineComponent, computed, ref} from 'vue'

import IonIntensity from './IonIntensity.vue'

import { RangeSlider, THUMB_WIDTH } from '../../components/Slider'

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

export default defineComponent({
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
    IonIntensity,
  },
  setup(props: Props, { emit }) {
    const { settings } = useIonImageSettings()
    const container = ref<HTMLElement | null>(null);
    const disableTooltips = ref(false);
    const componentKey = ref(0);


    const computedStyle = computed(() => {
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
      return null
    });

    const setScaleRange = (nextRange: [number, number]) => {
      const model: any = props.model
      const { min, max } = props.intensity
      if (min.status === 'LOCKED') {
        settings.lockMinScale = nextRange[0]
      }
      if (max.status === 'LOCKED') {
        settings.lockMaxScale = nextRange[1]
      }
      model.scaleRange = nextRange
    };

    const lockMin = (value: number) => {
      const model: any = props.model
      settings.lockMin = value
      settings.lockMinScale = 0
      model.scaleRange[0] = 0
    };

    const lockMax = (value: number) => {
      const model: any = props.model
      settings.lockMax = value
      settings.lockMaxScale = 1
      model.scaleRange[1] = 1
    };

    const handleThumbStart = () => {
      disableTooltips.value = true;
      emit('thumb-start');
    };

    const handleThumbStop = () => {
      disableTooltips.value = false;
      emit('thumb-stop');
    };

    const updateMinIntensity = (value) => {
      if(typeof value !== 'number') {
        return
      }
      const model: any = props.model
      model.minIntensity = value
      setScaleRange([0, props.scaleRange[1]]);
    };
    const updateMaxIntensity = (value) => {
      if(typeof value !== 'number') {
        return
      }
      const model: any = props.model
      model.maxIntensity = value
      setScaleRange([props.scaleRange[0], 1])
    };

    return {
      container,
      setScaleRange,
      lockMin,
      lockMax,
      disableTooltips: ref(false),
      style: computedStyle,
      handleThumbStart,
      handleThumbStop,
      updateMinIntensity,
      updateMaxIntensity,
      componentKey
    }
  },
})
</script>
