<template>
  <slider-track
    ref="container"
    :disabled="disabled"
  >
    <slider-thumb
      class="bg-gray-100"
      :disabled="disabled"
      :x="thumbX"
      :pixel-step="pixelStep"
      @change="emitValue"
    />
  </slider-track>
</template>
<script lang="ts">
import Vue from 'vue'
import { defineComponent, ref, Ref, reactive, onMounted, computed } from '@vue/composition-api'
import { throttle } from 'lodash-es'

import SliderTrack from './SliderTrack.vue'
import SliderThumb, { THUMB_WIDTH } from './SliderThumb.vue'
import useSliderThumb from './useSliderThumb'

interface Props {
  min: number
  max: number
  value: number
  step: number
  disabled: boolean
  color: string
}

interface ThumbState {
  thumbX: number
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
    step: { type: Number, default: 2 },
    disabled: Boolean,
  },
  setup(props, { emit, attrs }) {
    const container = ref<Vue>(null)

    const width = computed(() => {
      return container.value?.$el.clientWidth || 0
    })

    const range = computed(() => ({
      min: 0,
      max: width.value ? width.value - THUMB_WIDTH : 0,
    }))

    const thumb = useSliderThumb(props, range)

    function emitValue(x: number) {
      const value = thumb.setX(x)
      emit('change', value)
    }

    return {
      container,
      emitValue,
      thumbX: thumb.x,
      thumbStyle: {
        backgroundColor: 'transparent',
      },
      pixelStep: thumb.pixelStep,
    }
  },
})

export default Slider
</script>
