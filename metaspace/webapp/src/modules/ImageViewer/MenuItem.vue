<template>
  <div
    :class="[
      'px-3 h-21 outline-none cursor-pointer',
      {
        'bg-blue-100-alpha': activeLayer === layerId,
        'text-gray-700': !visible
      }
    ]"
    tabindex="0"
    @keypress.enter="emitActive"
    @keypress.space="emitActive"
    @mousedown.stop="emitActive"
    @keypress.delete="emitDelete"
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
      emitActive: () => emit('active', props.layerId),
      emitDelete: () => emit('delete', props.layerId),
    }
  },
})
</script>
