<template>
  <i class="flex w-6 h-6">
    <slot />
  </i>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'SecondaryIcon',
})
</script>

<style scoped>
i ::v-deep(svg) {
  width: 100%;
}

i ::v-deep(.primary) {
  @apply fill-current  text-blue-100;
}

i ::v-deep(.secondary) {
  @apply fill-current text-blue-800;
}
</style>
