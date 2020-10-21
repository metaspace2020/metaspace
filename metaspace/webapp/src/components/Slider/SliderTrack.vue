<template>
  <div
    class="box-border h-3 relative rounded-full bg-gray-100"
    data-slider-track
    @click.stop="onClick"
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
  [data-slider-track]::before {
    @apply absolute w-full h-full box-border border-2 border-solid border-transparent rounded-full;
    content: '';
  }
  [data-slider-track][disabled] {
    @apply pointer-events-none;
  }
  [data-slider-track][disabled]::before {
    @apply border-gray-300;
  }

  [data-slider-track] > div:focus {
    z-index: 1;
  }
</style>
