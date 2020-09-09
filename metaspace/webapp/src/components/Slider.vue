<template>
  <div
    ref="container"
    class="h-3 relative rounded-full bg-gray-100"
  >
    <div
      ref="leftThumb"
      :style="leftStyle"
      class="box-border h-3 w-3 absolute bg-gray-100 border border-solid border-gray-300 rounded-full cursor-pointer"
    />
    <div
      ref="rightThumb"
      :style="rightStyle"
      class="box-border h-3 w-3 absolute bg-gray-100 border border-solid border-gray-300 rounded-full cursor-pointer"
    />
  </div>
</template>
<script lang="ts">
import { defineComponent, ref, Ref, reactive, onMounted, computed } from '@vue/composition-api'

interface Props {
  min: number
  max: number
  value: [ number, number ]
  step: number
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
  },
  setup(props, { emit }) {
    const container = ref<HTMLElement>(null)
    const leftThumb = ref<HTMLElement>(null)
    const rightThumb = ref<HTMLElement>(null)
    // const line = ref<HTMLElement>(null)

    const { min = 0, max = 100, step = 1, value = [min, max] } = props

    const leftState = reactive<ThumbState>({
      startX: 0,
      x: 0,
    })
    const rightState = reactive<ThumbState>({
      startX: 0,
      x: 0,
    })

    const thumbWidth = 12
    const normalizeFact = thumbWidth * 2
    let maxX = 0

    const getWidth = () => container.value?.offsetWidth || 0

    function reset() {
      leftState.startX = 0
      leftState.x = 0

      rightState.startX = 0
      rightState.x = 0

      if (container.value) {
        maxX = container.value.offsetWidth - thumbWidth
      }
    }

    function setMinValue(minValue: number) {
      const ratio = ((minValue - min) / (max - min))
      leftState.x = Math.ceil(ratio * (getWidth() - (thumbWidth + normalizeFact)))
    }

    function setMaxValue(maxValue: number) {
      const ratio = ((maxValue - min) / (max - min))
      rightState.x = Math.ceil(ratio * (getWidth() - (thumbWidth + normalizeFact)) + normalizeFact)
    }

    function getEventTouch(event: MouseEvent | TouchEvent): MouseEvent | Touch {
      if ('touches' in event) {
        return event.touches[0]
      }
      return event
    }

    function onLeftMove(event: MouseEvent | TouchEvent) {
      const eventTouch = getEventTouch(event)

      let x = eventTouch.pageX - leftState.startX

      if (x > (rightState.x - thumbWidth)) {
        x = (rightState.x - thumbWidth)
      } else if (x < 0) {
        x = 0
      }

      leftState.x = x
      emitValue()
    }

    function onLeftStop() {
      document.removeEventListener('mousemove', onLeftMove)
      document.removeEventListener('mouseup', onLeftStop)
      document.removeEventListener('touchmove', onLeftMove)
      document.removeEventListener('touchend', onLeftStop)
    }

    function onLeftStart(event: MouseEvent | TouchEvent) {
      event.preventDefault()
      const eventTouch = getEventTouch(event)
      leftState.x = leftThumb?.value?.offsetLeft || 0
      leftState.startX = eventTouch.pageX - leftState.x

      document.addEventListener('mousemove', onLeftMove)
      document.addEventListener('mouseup', onLeftStop)
      document.addEventListener('touchmove', onLeftMove)
      document.addEventListener('touchend', onLeftStop)
    }

    function onRightMove(event: MouseEvent | TouchEvent) {
      const eventTouch = getEventTouch(event)

      let x = eventTouch.pageX - rightState.startX
      if (x < (leftState.x + thumbWidth)) {
        x = (leftState.x + thumbWidth)
      } else if (x > maxX) {
        x = maxX
      }

      rightState.x = x
      emitValue()
    }

    function onRightStop() {
      document.removeEventListener('mousemove', onRightMove)
      document.removeEventListener('mouseup', onRightStop)
      document.removeEventListener('touchmove', onRightMove)
      document.removeEventListener('touchend', onRightStop)
    }

    function onRightStart(event: MouseEvent | TouchEvent) {
      event.preventDefault()
      const eventTouch = getEventTouch(event)
      rightState.x = rightThumb?.value?.offsetLeft || 0
      rightState.startX = eventTouch.pageX - rightState.x

      document.addEventListener('mousemove', onRightMove)
      document.addEventListener('mouseup', onRightStop)
      document.addEventListener('touchmove', onRightMove)
      document.addEventListener('touchend', onRightStop)
    }

    onMounted(() => {
      reset()
      setMinValue(Math.max(value[0], min))
      setMaxValue(Math.min(value[1], max))

      if (leftThumb.value && rightThumb.value) {
        leftThumb.value.addEventListener('mousedown', onLeftStart)
        rightThumb.value.addEventListener('mousedown', onRightStart)
        leftThumb.value.addEventListener('touchstart', onLeftStart)
        rightThumb.value.addEventListener('touchstart', onRightStart)
      }
    })

    function emitValue() {
      let minValue = leftState.x / (maxX - thumbWidth)
      let maxValue = (rightState.x - thumbWidth) / (maxX - thumbWidth)

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
      leftThumb,
      rightThumb,
      leftStyle: computed(() => `left: ${leftState.x}px`),
      rightStyle: computed(() => `left: ${rightState.x}px`),
    }
  },
})

export default Slider

</script>
