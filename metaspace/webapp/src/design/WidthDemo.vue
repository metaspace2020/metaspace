<template>
  <div class="h-6 flex items-baseline">
    <div
      class="h-3 rounded"
      :class="[widthClass, intermediate ? 'bg-gray-400' : 'bg-primary']"
    />
    <p
      class="mx-3"
      :class="intermediate ? 'text-sm font-medium' : 'font-bold'"
    >
      {{ name }}
    </p>
    <p class="text-sm text-gray-700">
      {{ definition }}
    </p>
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'
export default defineComponent({
  props: {
    widthClass: String,
    name: String,
    definition: String,
    intermediate: Boolean,
  },
})
</script>
