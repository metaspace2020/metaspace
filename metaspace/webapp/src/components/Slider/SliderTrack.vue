<template>
  <div
    class="box-border h-3 relative rounded-full bg-gray-100 sm-slider-track cursor-pointer"
    @click.stop="onClick"
    @keypress.enter.self="$emit('keypress')"
    @keypress.space.self.prevent="$emit('keypress')"
    @mousedown.capture="$emit('mousedown')"
  >
    <slot />
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'
export default defineComponent({
  setup(_, { emit }) {
    return {
      onClick(e: MouseEvent) {
        emit('click', e.offsetX)
      },
    }
  },
})
</script>
<style scoped>
  .sm-slider-track::before {
    @apply absolute w-full h-full box-border border-2 border-solid border-transparent rounded-full;
    content: '';
  }
  .sm-slider-track[disabled] {
    @apply pointer-events-none;
  }
  .sm-slider-track[disabled]::before {
    @apply border-gray-300;
  }

  .sm-slider-track > div:focus {
    z-index: 1;
  }
</style>
