<template>
  <overlay class="overflow-x-hidden overflow-y-auto px-0 sm-menu-items">
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
  .sm-menu-items >>> > * {
    @apply box-border border-0 border-t border-solid border-gray-200-alpha;
  }
  .sm-menu-items >>> > *:last-child {
    @apply border-b;
  }
  .sm-menu-items >>> > .focus-visible {
    outline: 2px solid theme('colors.primary');
    outline-offset: -2px;
  }
  .sm-menu-items >>> > *:hover {
    outline: 1px solid theme('colors.primary');
    outline-offset: -1px;
  }
</style>
