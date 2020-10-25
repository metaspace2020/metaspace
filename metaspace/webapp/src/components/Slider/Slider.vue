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
      :pixel-step="pixelStep"
      :bounds="thumbBounds"
      @change="onThumbChange"
    />
  </slider-track>
</template>
<script lang="ts">
import Vue from 'vue'
import { defineComponent, ref, Ref, reactive, onMounted, computed } from '@vue/composition-api'
import { throttle } from 'lodash-es'

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
  setup(props, { emit, attrs }) {
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
      emit('change', value)
    }

    function onTrackClick(x: number) {
      const { minX, maxX } = range.value
      onThumbChange(Math.max(Math.min(x - THUMB_WIDTH / 2, maxX), minX))
    }

    return {
      track,
      onThumbChange,
      onTrackClick,
      thumbBounds: range,
      thumbX: thumb.x,
      pixelStep: thumb.pixelStep,
    }
  },
})

export default Slider
</script>
