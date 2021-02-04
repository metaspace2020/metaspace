<template>
  <div class="flex items-baseline h-6">
    <div
      class="h-3 bg-primary rounded"
      :class="widthClass"
    />
    <p class="font-medium px-3">
      {{ name }}
    </p>
    <p class="text-sm text-gray-700 ml-auto">
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
  },
})
</script>
