<template>
  <button
    title="Multi-image mode"
    class="button-reset h-9 w-9 rounded-full flex items-center justify-center focus-ring-primary"
    :class="{
      'bg-blue-100': isActive,
      'hover:bg-gray-100': !isActive,
    }"
    @click="onClick"
  >
    <layers-icon
      class="sm-stateful-icon"
      :class="{ 'sm-stateful-icon--active': isActive }"
    />
  </button>
</template>
<script lang="ts">
import { defineComponent, computed } from '@vue/composition-api'

import LayersIcon from '../../assets/inline/refactoring-ui/layers.svg'

import viewerState, { toggleMode } from './state'

export default defineComponent({
  components: {
    LayersIcon,
  },
  setup(_, { emit }) {
    const isActive = computed(() => viewerState.mode.value === 'MULTI')
    return {
      isActive,
      onClick() {
        toggleMode()
        if (isActive.value === true) {
          emit('multi')
        }
      },
    }
  },
})
</script>
