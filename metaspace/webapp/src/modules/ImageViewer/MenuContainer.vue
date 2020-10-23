<template>
  <overlay
    class="w-60 overflow-x-hidden overflow-y-auto px-0"
    data-menu-items
  >
    <slot />
  </overlay>
</template>
<script lang="ts">
import Vue from 'vue'

import Overlay from './Overlay.vue'

export default Vue.extend({
  components: {
    Overlay,
  },
})
</script>
<style scoped>
  [data-menu-items] >>> > * {
    @apply box-border border-0 border-t border-solid border-gray-200-alpha;
  }
  [data-menu-items] >>> > *:last-child {
    @apply border-b;
  }
  [data-menu-items] >>> > .focus-visible {
    outline: 2px solid theme('colors.primary');
    outline-offset: -2px;
  }
  [data-menu-items] >>> > *:hover {
    outline: 1px solid theme('colors.primary');
    outline-offset: -1px;
  }
</style>
