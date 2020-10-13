<template>
  <span :style="style">
    <slot />
  </span>
</template>
<script lang="ts">
import { defineComponent, computed } from '@vue/composition-api'
export default defineComponent({
  props: {
    x: Number,
  },
  setup(props) {
    return {
      style: computed(() => ({ left: props.x })),
    }
  },
})
</script>
<style scoped>

</style>
