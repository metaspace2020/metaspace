<template>
  <div
    :class="[
      'px-3 h-21 box-border outline-none cursor-pointer',
      'border-2 border-solid border-transparent focus:border-primary', {
        'bg-blue-100': activeLayer === layerId,
        'text-gray-700': !visible
      }
    ]"
    tabindex="0"
    @keypress.enter="emit('active', layerId)"
    @click.stop="emit('active', layerId)"
    @keypress.delete="emit('delete', layerId)"
  >
    <slot />
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
export default Vue.extend({
  props: {
    activeLayer: String,
    layerId: String,
    visible: { type: Boolean, default: true },
  },
  setup(props, { emit }) {
    return {
      emit,
    }
  },
})
</script>
