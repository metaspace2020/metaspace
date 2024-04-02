<template>
  <i
    class="flex rounded-full p-2 bg-blue-100"
    :class="[{ inverse }, large ? 'w-8 h-8' : small ? 'w-5 h-5' : 'w-6 h-6']"
  >
    <slot />
  </i>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  props: {
    inverse: Boolean,
    small: Boolean,
    large: Boolean,
  },
})
</script>

<style scoped>
i ::v-deep(svg) {
  width: 100%;
}

i ::v-deep(.primary),
i.inverse ::v-deep(.secondary) {
  @apply fill-current text-blue-400;
}

i ::v-deep(.secondary),
i.inverse ::v-deep(.primary) {
  @apply fill-current text-blue-800;
}
</style>
