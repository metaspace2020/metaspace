<template>
  <i class="flex" :class="{ active, hover, inverse }">
    <slot />
  </i>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
export default defineComponent({
  props: {
    active: Boolean,
    hover: Boolean,
    inverse: Boolean,
  },
})
</script>
<style scoped>
i ::v-deep(svg) {
  width: 100%;
}

i ::v-deep(.primary),
i.inverse ::v-deep(.secondary) {
  @apply fill-current text-gray-400;
}

i ::v-deep(.secondary),
i.inverse ::v-deep(.primary) {
  @apply fill-current text-gray-800;
}

i.active ::v-deep(.primary),
i.hover:hover ::v-deep(.primary),
i.active.inverse ::v-deep(.secondary),
i.hover.inverse:hover ::v-deep(.secondary) {
  @apply text-blue-400;
}

i.active ::v-deep(.secondary),
i.hover:hover ::v-deep(.secondary),
i.active.inverse ::v-deep(.primary),
i.hover.inverse:hover ::v-deep(.primary) {
  @apply text-blue-800;
}
</style>
