<template>
  <i
    class="flex rounded-full p-2 fill-current bg-blue-100"
    :class="[{ inverse }, large ? 'w-8 h-8' : 'w-6 h-6']"
  >
    <slot />
  </i>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'
export default defineComponent({
  props: {
    inverse: Boolean,
    large: Boolean,
  },
})
</script>
<style scoped>
i >>> .primary,
i.inverse >>> .secondary {
  @apply text-blue-400;
}
i >>> .secondary,
i.inverse >>> .primary {
  @apply text-blue-800;
}
</style>
