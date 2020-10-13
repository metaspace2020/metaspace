<template>
  <div
    ref="thumb"
    :tabindex="disabled ? false : 0"
    :style="position"
    class="box-border h-3 w-3 absolute bg-gray-100 border-2 border-solid border-gray-300 rounded-full cursor-pointer focus-ring-primary"
  />
</template>
<script lang="ts">
import { defineComponent, reactive, ref, computed, onMounted } from '@vue/composition-api'
import { throttle } from 'lodash-es'

interface State {
  startX: number
}

interface Props {
  disabled?: boolean
  x: number
  pixelStep: number
  bounds: { minX: number, maxX: number }
}

export const THUMB_WIDTH = 12

export default defineComponent<Props>({
  props: {
    disabled: { type: Boolean, default: false },
    x: Number,
    pixelStep: Number,
    bounds: Object,
  },
  setup(props, { emit }) {
    const thumb = ref<HTMLElement>(null)
    const state = reactive<State>({
      startX: props.x,
    })

    function getEventTouch(event: MouseEvent | TouchEvent): MouseEvent | Touch {
      if ('touches' in event) {
        return event.touches[0]
      }
      return event
    }

    function emitX(x: number) {
      emit('change', Math.min(Math.max(x, props.bounds.minX), props.bounds.maxX))
    }

    function onMove(event: MouseEvent | TouchEvent) {
      const eventTouch = getEventTouch(event)
      emitX(eventTouch.pageX - state.startX)
    }

    function onStop() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onStop)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onStop)
    }

    function onStart(event: MouseEvent | TouchEvent) {
      event.preventDefault()
      const eventTouch = getEventTouch(event)
      state.startX = eventTouch.pageX - props.x

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onStop)
      document.addEventListener('touchmove', onMove)
      document.addEventListener('touchend', onStop)

      if (thumb.value) {
        thumb.value.focus()
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      event.stopPropagation()
      const multiply = event.shiftKey ? 10 : 1
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault()
        emitX(props.x - props.pixelStep * multiply)
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault()
        emitX(props.x + props.pixelStep * multiply)
      }
    }

    onMounted(() => {
      if (thumb.value) {
        thumb.value.addEventListener('mousedown', onStart)
        thumb.value.addEventListener('touchstart', onStart)
        thumb.value.addEventListener('keydown', throttle(onKeyUp, 50))
      }
    })

    return {
      thumb,
      position: computed(() => ({ left: `${props.x}px` })),
    }
  },
})
</script>
