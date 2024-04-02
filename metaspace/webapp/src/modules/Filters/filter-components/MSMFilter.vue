<template>
  <number-filter v-bind="$attrs" :max="1" :min="0" :step="0.01" />
</template>

<script>
import { defineComponent } from 'vue'
import NumberFilter from './NumberFilter.vue'

export default defineComponent({
  name: 'MSMFilter',
  components: {
    NumberFilter,
  },
})
</script>
