<template>
  <div>
    <p :class="textClasses">
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
      Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
    </p>
    <p>
      <code class="text-lg">{{ textClasses }}</code>
      <span class="text-sm text-gray-700 ml-1">
        {{ definition }}
      </span>
    </p>
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'
export default defineComponent({
  props: {
    textClasses: String,
    definition: String,
  },
})
</script>
<style scoped>
p + p {
  @apply mt-3;
}
</style>
