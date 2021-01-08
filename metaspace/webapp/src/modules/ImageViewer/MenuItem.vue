<template>
  <div
    :class="[
      'px-3 h-21 outline-none',
      {
        'bg-blue-100-alpha': isActive,
        'text-gray-700': !visible
      }
    ]"
    tabindex="0"
    @keyup.enter.self="emitActive"
    @keyup.space.self.prevent="emitActive"
    @click.stop="emitActive"
    @keyup.self.delete="emitRemove"
    @click.middle="emitRemove"
    @mousedown.capture="$emit('mousedown')"
    @keydown.capture="$emit('keydown')"
  >
    <fade-transition>
      <p
        v-if="loading"
        key="loading"
        class="m-0 ml-3 text-gray-700 text-sm font-medium"
      >
        Loading image &hellip;
      </p>
      <div v-else>
        <slot />
      </div>
    </fade-transition>
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'

import FadeTransition from '../../components/FadeTransition'

export default defineComponent({
  components: {
    FadeTransition,
  },
  props: {
    isActive: Boolean,
    layerId: String,
    visible: { type: Boolean, default: true },
    loading: { type: Boolean, default: true },
  },
  setup(props, { emit }) {
    return {
      emitActive: () => emit('active', props.layerId),
      emitRemove: () => emit('remove', props.layerId),
    }
  },
})
</script>
<style scoped>
[tabindex].focus-visible {
  outline: 2px solid theme('colors.primary');
  outline-offset: -2px;
}
[tabindex]:hover {
  outline: none;
}
</style>
