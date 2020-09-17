<template>
  <div
    ref="container"
    class="box-border h-3 relative rounded-full bg-gray-100"
    :disabled="disabled"
    data-slider
    @click.capture.stop
  >
    <div
      ref="minThumb"
      :style="minStyle"
      :tabindex="disabled ? false : 0"
      class="box-border h-3 w-3 absolute bg-gray-100 border border-solid border-gray-300 rounded-full cursor-pointer focus-ring-primary"
    />
    <span
      :style="minStyle"
      class="-ml-1"
    >
      {{ minTooltip }}
    </span>
    <div
      ref="maxThumb"
      :style="maxStyle"
      :tabindex="disabled ? false : 0"
      class="box-border h-3 w-3 absolute bg-gray-100 border border-solid border-gray-300 rounded-full cursor-pointer focus-ring-primary"
    >
    </div>
    <span
      :style="maxStyle"
      class="-mr-1"
    >
      {{ maxTooltip }}
    </span>
  </div>
</template>
<script lang="ts">
/* Adapted from this example: https://codepen.io/zebresel/pen/xGLYOM?editors=0010 */
import { defineComponent, ref, Ref, reactive, onMounted, computed } from '@vue/composition-api'
import { throttle } from 'lodash-es'

interface Props {
  min: number
  max: number
  value: [ number, number ]
  step: number
  disabled: boolean
  minTooltip: string
  maxTooltip: string
}

interface ThumbState {
  startX: number
  x: number
}

const Slider = defineComponent<Props>({
  props: {
    min: Number,
    max: Number,
    value: Array,
    step: Number,
    disabled: Boolean,
    minTooltip: String,
    maxTooltip: String,
  },
  setup(props, { emit, attrs }) {
    const container = ref<HTMLElement>(null)
    const minThumb = ref<HTMLElement>(null)
    const maxThumb = ref<HTMLElement>(null)
    // const line = ref<HTMLElement>(null)

    const { min = 0, max = 100, step = 1, value = [min, max] } = props

    const minState = reactive<ThumbState>({
      startX: 0,
      x: 0,
    })
    const maxState = reactive<ThumbState>({
      startX: 0,
      x: 0,
    })

    const thumbWidth = 12
    const normalizeFact = thumbWidth * 2
    let maxX = 0

    const getWidth = () => container.value?.offsetWidth || 0

    function reset() {
      minState.startX = 0
      minState.x = 0

      maxState.startX = 0
      maxState.x = 0

      if (container.value) {
        maxX = container.value.offsetWidth - thumbWidth
      }
    }

    function setMinValue(minValue: number) {
      const ratio = ((minValue - min) / (max - min))
      minState.x = Math.ceil(ratio * (getWidth() - (thumbWidth + normalizeFact)))
    }

    function setMaxValue(maxValue: number) {
      const ratio = ((maxValue - min) / (max - min))
      maxState.x = Math.ceil(ratio * (getWidth() - (thumbWidth + normalizeFact)) + normalizeFact)
    }

    function getEventTouch(event: MouseEvent | TouchEvent): MouseEvent | Touch {
      if ('touches' in event) {
        return event.touches[0]
      }
      return event
    }

    function setMinX(x: number) {
      if (x > (maxState.x - thumbWidth)) {
        x = (maxState.x - thumbWidth)
      } else if (x < 0) {
        x = 0
      }
      minState.x = x
    }

    function onMinMove(event: MouseEvent | TouchEvent) {
      const eventTouch = getEventTouch(event)
      setMinX(eventTouch.pageX - minState.startX)
      emitValue()
    }

    function onMinStop() {
      document.removeEventListener('mousemove', onMinMove)
      document.removeEventListener('mouseup', onMinStop)
      document.removeEventListener('touchmove', onMinMove)
      document.removeEventListener('touchend', onMinStop)
    }

    function onMinStart(event: MouseEvent | TouchEvent) {
      event.preventDefault()
      const eventTouch = getEventTouch(event)
      minState.x = minThumb?.value?.offsetLeft || 0
      minState.startX = eventTouch.pageX - minState.x

      document.addEventListener('mousemove', onMinMove)
      document.addEventListener('mouseup', onMinStop)
      document.addEventListener('touchmove', onMinMove)
      document.addEventListener('touchend', onMinStop)

      if (minThumb.value) {
        minThumb.value.focus()
      }
    }

    function setMaxX(x: number) {
      if (x < (minState.x + thumbWidth)) {
        x = (minState.x + thumbWidth)
      } else if (x > maxX) {
        x = maxX
      }
      maxState.x = x
    }

    function onMaxMove(event: MouseEvent | TouchEvent) {
      const eventTouch = getEventTouch(event)
      setMaxX(eventTouch.pageX - maxState.startX)
      emitValue()
    }

    function onMaxStop() {
      document.removeEventListener('mousemove', onMaxMove)
      document.removeEventListener('mouseup', onMaxStop)
      document.removeEventListener('touchmove', onMaxMove)
      document.removeEventListener('touchend', onMaxStop)
    }

    function onMaxStart(event: MouseEvent | TouchEvent) {
      event.preventDefault()
      const eventTouch = getEventTouch(event)
      maxState.x = maxThumb?.value?.offsetLeft || 0
      maxState.startX = eventTouch.pageX - maxState.x

      document.addEventListener('mousemove', onMaxMove)
      document.addEventListener('mouseup', onMaxStop)
      document.addEventListener('touchmove', onMaxMove)
      document.addEventListener('touchend', onMaxStop)

      if (maxThumb.value) {
        maxThumb.value.focus()
      }
    }

    function onMinKeyUp(event: KeyboardEvent) {
      event.stopPropagation()
      event.preventDefault()
      const { max, step } = props
      const multiply = event.shiftKey ? 10 : 1
      const pixelStep = ((step * multiply) / max) * maxX
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        setMinX(minState.x - pixelStep)
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        setMinX(minState.x + pixelStep)
      }
      emitValue()
    }

    function onMaxKeyUp(event: KeyboardEvent) {
      event.stopPropagation()
      event.preventDefault()
      const { max, step } = props
      const multiply = event.shiftKey ? 10 : 1
      const pixelStep = ((step * multiply) / max) * maxX
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        setMaxX(maxState.x - pixelStep)
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        setMaxX(maxState.x + pixelStep)
      }
      emitValue()
    }

    onMounted(() => {
      reset()
      setMinValue(Math.max(value[0], min))
      setMaxValue(Math.min(value[1], max))

      if (minThumb.value && maxThumb.value) {
        minThumb.value.addEventListener('mousedown', onMinStart)
        maxThumb.value.addEventListener('mousedown', onMaxStart)
        minThumb.value.addEventListener('touchstart', onMinStart)
        maxThumb.value.addEventListener('touchstart', onMaxStart)

        minThumb.value.addEventListener('keydown', throttle(onMinKeyUp, 50))
        maxThumb.value.addEventListener('keydown', throttle(onMaxKeyUp, 50))
      }
    })

    function emitValue() {
      let minValue = minState.x / (maxX - thumbWidth)
      let maxValue = (maxState.x - thumbWidth) / (maxX - thumbWidth)

      minValue = minValue * (max - min) + min
      maxValue = maxValue * (max - min) + min

      if (step !== 0.0) {
        let multi = Math.floor((minValue / step))
        minValue = step * multi

        multi = Math.floor((maxValue / step))
        maxValue = step * multi
      }

      emit('change', [minValue, maxValue])
    }

    return {
      container,
      minThumb,
      maxThumb,
      minStyle: computed(() => `left: ${minState.x}px`),
      maxStyle: computed(() => `right: ${getWidth() - maxState.x - thumbWidth}px`),
    }
  },
})

export default Slider

</script>
<style scoped>
  [data-slider]::before {
    @apply absolute w-full h-full box-border border-2 border-solid border-transparent rounded-full;
    content: '';
  }
  [data-slider][disabled] {
    @apply pointer-events-none;
  }
  [data-slider][disabled]::before {
    @apply border-gray-300;
  }

  div:focus {
    z-index: 1;
  }

  span {
    @apply absolute p-1 mb-2 text-xs tracking-wide shadow-sm rounded-sm leading-none bg-white;
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
