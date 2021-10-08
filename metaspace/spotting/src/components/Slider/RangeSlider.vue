<template>
  <slider-track
    ref="track"
    :disabled="disabled"
    @click="onTrackClick"
    @mousedown="lockTrackClick = false"
  >
    <slider-thumb
      :style="minStyle"
      :disabled="disabled"
      :x="minThumb.x.value"
      @change="onMinChange"
      @increment="onMinIncrement"
      @decrement="onMinDecrement"
      @thumb-start="onThumbStart"
      @thumb-stop="onThumbStop"
    />
    <slider-thumb
      :style="maxStyle"
      :disabled="disabled"
      :x="maxThumb.x.value"
      @change="onMaxChange"
      @increment="onMaxIncrement"
      @decrement="onMaxDecrement"
      @thumb-start="onThumbStart"
      @thumb-stop="onThumbStop"
    />
  </slider-track>
</template>
<script lang="ts">
import Vue from 'vue'
import { defineComponent, ref, computed } from '@vue/composition-api'

import SliderTrack from './SliderTrack.vue'
import SliderThumb from './SliderThumb.vue'
import useSliderThumb from './useSliderThumb'
import { THUMB_WIDTH } from './constants'

interface Props {
  min: number
  max: number
  value: [ number, number ]
  step: number
  disabled: boolean
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
    minColor: String,
    maxColor: String,
  },
  setup(props, { emit }) {
    const track = ref<Vue>(null)

    // hides aliasing around thumbs
    const padding = 1

    const maxX = computed(() => {
      return track.value ? track.value.$el.clientWidth + padding - THUMB_WIDTH : 0
    })

    const getMinProps = () => ({
      value: props.value[0],
      min: props.min,
      max: props.max,
      step: props.step,
      maxBound: props.value[1],
    })

    const minRange = computed(() => ({
      minX: 0 - padding,
      maxX: maxX.value - THUMB_WIDTH,
    }))

    const minThumb = useSliderThumb(getMinProps, minRange)

    const getMaxProps = () => ({
      value: props.value[1],
      min: props.min,
      max: props.max,
      step: props.step,
      minBound: props.value[0],
    })

    const maxRange = computed(() => ({
      minX: minRange.value.minX + THUMB_WIDTH,
      maxX: maxX.value,
    }))

    const maxThumb = useSliderThumb(getMaxProps, maxRange)

    const emitMinChange = (value: number) => emit('input', [value, props.value[1]])
    const emitMaxChange = (value: number) => emit('input', [props.value[0], value])

    const lockTrackClick = ref(false)

    const onMinChange = (x: number) => emitMinChange(minThumb.getValue(x))
    const onMaxChange = (x: number) => emitMaxChange(maxThumb.getValue(x))

    return {
      lockTrackClick,
      track,
      minThumb,
      maxThumb,
      onMinChange,
      onMaxChange,
      onMinIncrement: (factor: number) => emitMinChange(minThumb.increment(factor)),
      onMinDecrement: (factor: number) => emitMinChange(minThumb.decrement(factor)),
      onMaxIncrement: (factor: number) => emitMaxChange(maxThumb.increment(factor)),
      onMaxDecrement: (factor: number) => emitMaxChange(maxThumb.decrement(factor)),
      minStyle: computed(() => ({ backgroundColor: props.minColor })),
      maxStyle: computed(() => ({ backgroundColor: props.maxColor })),
      onThumbStart() {
        lockTrackClick.value = true
        emit('thumb-start')
      },
      onThumbStop() {
        emit('thumb-stop')
      },
      onTrackClick(x: number) {
        if (lockTrackClick.value) {
          return
        }
        const diffMin = Math.abs(x - minThumb.x.value)
        const diffMax = Math.abs(x - maxThumb.x.value)
        const onChange = diffMin < diffMax ? onMinChange : onMaxChange
        onChange(x - THUMB_WIDTH / 2)
      },
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
