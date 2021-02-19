<template>
  <i
    class="flex"
    :class="{ active, hover, inverse }"
  >
    <slot />
  </i>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'
export default defineComponent({
  props: {
    active: Boolean,
    hover: Boolean,
    inverse: Boolean,
  },
})
</script>
<style scoped>
i >>> svg {
  width: 100%;
}

i >>> .primary,
i.inverse >>> .secondary {
  @apply fill-current text-gray-400;
}

i >>> .secondary,
i.inverse >>> .primary {
  @apply fill-current text-gray-800;
}

i.active >>> .primary,
i.hover:hover >>> .primary,
i.active.inverse >>> .secondary,
i.hover.inverse:hover >>> .secondary {
  @apply text-blue-400;
}

i.active >>> .secondary,
i.hover:hover >>> .secondary,
i.active.inverse >>> .primary,
i.hover.inverse:hover >>> .primary {
  @apply text-blue-800;
}
</style>
