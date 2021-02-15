<template>
  <div>
    <p class="text-xs leading-4">
      <span
        class="block mb-2 p-2 -ml-2 bg-gray-100 rounded box-border"
        :class="twClass"
      >
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
      </span>
    </p>
    <p>
      <code class="text-lg">{{ twClass }}</code>
      <span class="text-sm text-gray-700 ml-1">
        {{ maxWidth[`measure-${level}`] }}
      </span>
    </p>
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'

import tailwindConfig from '../../tailwind.config'

export default defineComponent({
  props: {
    level: String,
  },
  setup(props) {
    return {
      maxWidth: tailwindConfig.theme.extend.maxWidth,
      twClass: `max-w-measure-${props.level}`,
    }
  },
})
</script>
<style scoped>
p {
  max-width: none;
}
</style>
