<template>
  <number-filter
    v-bind="$attrs"
    :max="1"
    :min="0"
    :step="0.01"
    v-on="$listeners"
  />
</template>

<script>
import Vue, { ComponentOptions } from 'vue'
import NumberFilter from './NumberFilter.vue'

export default Vue.extend({
  name: 'MSMFilter',
  components: {
    NumberFilter,
  },
})
</script>
