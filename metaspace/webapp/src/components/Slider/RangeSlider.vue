<template>
  <slider-track
    ref="track"
    :disabled="disabled"
    @click="emit('track-click')"
  >
    <slider-thumb
      :style="minStyle"
      :disabled="disabled"
      :x="minThumb.x.value"
      :pixel-step="minThumb.pixelStep.value"
      :bounds="minBounds"
      @change="onMinChange"
      @thumb-start="emit('thumb-start')"
      @thumb-stop="emit('thumb-stop')"
    />
    <span
      class="-ml-1"
      :style="minPosition"
    >
      {{ minTooltip }}
    </span>
    <slider-thumb
      :style="maxStyle"
      :disabled="disabled"
      :x="maxThumb.x.value"
      :pixel-step="maxThumb.pixelStep.value"
      :bounds="maxBounds"
      @change="onMaxChange"
      @thumb-start="emit('thumb-start')"
      @thumb-stop="emit('thumb-stop')"
    />
    <span
      class="-mr-1"
      :style="maxPosition"
    >
      {{ maxTooltip }}
    </span>
  </slider-track>
</template>
<script lang="ts">
import Vue from 'vue'
import { defineComponent, ref, Ref, reactive, computed } from '@vue/composition-api'
import { throttle } from 'lodash-es'

import SliderTrack from './SliderTrack.vue'
import SliderThumb from './SliderThumb.vue'
import useSliderThumb, { SliderThumbInstance } from './useSliderThumb'
import { THUMB_WIDTH } from './constants'

interface Props {
  min: number
  max: number
  value: [ number, number ]
  step: number
  disabled: boolean
  minTooltip: string
  maxTooltip: string
  minColor: string
  maxColor: string
}

const Slider = defineComponent<Props>({
  components: {
    SliderThumb,
    SliderTrack,
  },
  props: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: 100 },
    value: Array,
    step: { type: Number, default: 1 },
    disabled: Boolean,
    minTooltip: String,
    maxTooltip: String,
    minColor: String,
    maxColor: String,
  },
  setup(props, { emit, attrs }) {
    const track = ref<Vue>(null)

    const width = computed(() => {
      return track.value?.$el.clientWidth || 0
    })

    const getMinProps = () => ({
      value: props.value[0],
      min: props.min,
      max: props.max,
      step: props.step,
    })

    const minRange = computed(() => ({
      minX: 0,
      maxX: width.value ? width.value - (THUMB_WIDTH * 2) : 0,
    }))

    const minThumb = useSliderThumb(getMinProps, minRange)

    const getMaxProps = () => ({
      value: props.value[1],
      min: props.min,
      max: props.max,
      step: props.step,
    })

    const maxRange = computed(() => ({
      minX: THUMB_WIDTH,
      maxX: width.value ? width.value - THUMB_WIDTH : 0,
    }))

    const maxThumb = useSliderThumb(getMaxProps, maxRange)

    const minPosition = computed(() => ({ left: `${minThumb.x.value}px` }))
    const maxPosition = computed(() => {
      if (!width.value) return '0px'
      return { right: `${width.value - maxThumb.x.value - THUMB_WIDTH}px` }
    })

    return {
      emit,
      track,
      minThumb,
      maxThumb,
      minBounds: computed(() => ({
        minX: 0,
        maxX: maxThumb.x.value - THUMB_WIDTH,
      })),
      maxBounds: computed(() => ({
        minX: minThumb.x.value + THUMB_WIDTH,
        maxX: width.value ? width.value - THUMB_WIDTH : 0,
      })),
      onMinChange(x: number) {
        const value = minThumb?.getValue(x)
        emit('change', [value, props.value[1]])
      },
      onMaxChange(x: number) {
        const value = maxThumb?.getValue(x)
        emit('change', [props.value[0], value])
      },
      minPosition,
      maxPosition,
      width,
      minStyle: computed(() => ({ backgroundColor: props.minColor })),
      maxStyle: computed(() => ({ backgroundColor: props.maxColor })),
    }
  },
})

export default Slider
</script>
<style scoped>
  span {
    @apply absolute p-1 mb-1 text-xs tracking-wide shadow-sm rounded-sm leading-none bg-white;
    @apply transition-opacity duration-300 ease-in-out pointer-events-none;
    bottom: 100%;
    visiblity: hidden;
    opacity: 0;
  }
  div:hover + span,
  div:focus + span,
  span:focus-within {
    visibility: visible;
    opacity: 1;
  }
  div:hover + span {
    z-index: 1;
  }
</style>
