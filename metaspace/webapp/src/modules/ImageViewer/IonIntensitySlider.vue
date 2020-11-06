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
      @change="range => $emit('change', range)"
      @thumb-start="disableTooltips = true; $emit('thumb-start')"
      @thumb-stop="disableTooltips = false; $emit('thumb-stop')"
      @track-click="$emit('track-click')"
    />
    <div
      v-if="intensity"
      class="flex justify-between items-center h-6 leading-6 tracking-wide"
    >
      <fade-transition>
        <span
          v-if="intensity.isMinLocked"
          class="cursor-not-allowed font-medium text-blue-700"
          title="Locked intensity"
        >
          {{ values.rangeMin }}
        </span>
        <form
          v-else-if="editMin"
          key="edit"
          @submit.prevent="setMinIntensity"
          @keyup.esc="editMin = false"
        >
          <input
            v-model="minIntensity"
            type="text"
            placeholder="min."
            class="px-1 bg-white text-xs border border-solid border-gray-300 h-6 box-border shadow min-w-0 w-16 relative z-10 focus:border-primary outline-none"
          />
          <button
            type="submit"
            class="hidden"
          />
        </form>
        <clipping-tooltip
          v-else-if="intensity.isMinClipped"
          key="clipped"
          clipping-type="outlier-min"
          placement="bottom-start"
          :clipped-intensity="values.rangeMin"
          :original-intensity="values.imageMin"
          :disabled="disableTooltips"
          @click="editMin = true"
        />
        <span
          v-else
          key=""
          class="cursor-pointer"
          @click="editMin = true"
        >
          {{ values.rangeMin }}
        </span>
      </fade-transition>
      <clipping-tooltip
        v-if="intensity.isMaxClipped"
        placement="bottom-end"
        :clipping-type="intensity.isMinClipped ? 'outlier-max' : 'hotspot-removal'"
        :clipped-intensity="values.rangeMax"
        :original-intensity="values.imageMax"
        :disabled="disableTooltips"
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
    ClippingTooltip,
    FadeTransition,
  },
  setup(props) {
    const { settings } = useIonImageSettings()

    const container = ref<HTMLElement>()
    const values = computed(() => ({
      rangeMin: props.intensity.clippedMin.toExponential(1),
      rangeMax: props.intensity.clippedMax.toExponential(1),
      tooltipMin: props.intensity.scaledMin.toExponential(1),
      tooltipMax: props.intensity.scaledMax.toExponential(1),
      imageMin: props.intensity.imageMin.toExponential(1),
      imageMax: props.intensity.imageMax.toExponential(1),
    }))

    const minIntensity = ref(values.value.rangeMin)
    const editMin = ref(false)

    return {
      container,
      settings,
      values,
      minIntensity,
      editMin,
      setMinIntensity() {
        props.model.minIntensity = parseFloat(minIntensity.value)
        editMin.value = false
      },
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
