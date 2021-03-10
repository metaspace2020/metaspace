<template>
  <i class="flex w-6 h-6">
    <slot />
  </i>
</template>
<script lang="ts">
import Vue from 'vue'
export default Vue.extend({
  // needed for use in tsx files
})
</script>
<style scoped>
i >>> svg {
  width: 100%;
}
i >>> .primary {
  @apply fill-current  text-blue-100;
}
i >>> .secondary {
  @apply fill-current text-blue-800;
}
</style>
