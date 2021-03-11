<template>
  <slider-track
    ref="track"
    class="cursor-pointer"
    :disabled="disabled"
    @click="onTrackClick"
  >
    <slider-thumb
      class="bg-gray-100"
      :disabled="disabled"
      :x="thumbX"
      :bounds="thumbBounds"
      @change="onThumbChange"
      @increment="increment"
      @decrement="decrement"
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
  value: number
  step: number
  disabled: boolean
}

const Slider = defineComponent<Props>({
  components: {
    SliderThumb,
    SliderTrack,
  },
  props: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: 100 },
    value: Number,
    step: { type: Number, default: 1 },
    disabled: Boolean,
  },
  setup(props, { emit }) {
    const track = ref<Vue>(null)

    const width = computed(() => {
      return track.value?.$el.clientWidth || 0
    })

    const range = computed(() => ({
      minX: 0,
      maxX: width.value ? width.value - THUMB_WIDTH : 0,
    }))

    const thumb = useSliderThumb(() => props, range)

    function onThumbChange(x: number) {
      const value = thumb.getValue(x)
      emit('input', value)
    }

    function onTrackClick(x: number) {
      onThumbChange(x - THUMB_WIDTH / 2)
    }

    return {
      track,
      onThumbChange,
      onTrackClick,
      thumbBounds: range,
      thumbX: thumb.x,
      increment(factor: number) {
        emit('input', thumb.increment(factor))
      },
      decrement(factor: number) {
        emit('input', thumb.decrement(factor))
      },
    }
  },
})

export default Slider
</script>
