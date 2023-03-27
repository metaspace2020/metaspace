<template>
  <i
    class="flex rounded-full p-2 bg-blue-100"
    :class="[{ inverse }, large ? 'w-8 h-8' : (small ? 'w-5 h-5' : 'w-6 h-6')]"
  >
    <slot />
  </i>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'
export default defineComponent({
  props: {
    inverse: Boolean,
    small: Boolean,
    large: Boolean,
  },
})
</script>
<style scoped>
i >>> svg {
  width: 100%;
}
i >>> .primary,
i.inverse >>> .secondary {
  @apply fill-current text-blue-400;
}
i >>> .secondary,
i.inverse >>> .primary {
  @apply fill-current text-blue-800;
}
</style>
