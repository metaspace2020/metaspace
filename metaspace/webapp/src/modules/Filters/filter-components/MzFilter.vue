<template>
  <number-filter
    v-bind="$attrs"
    :step="0.0001"
    :raw-input="true"
    v-on="$listeners"
  >
    <span class="ml-1">
      ± {{ precision }}
    </span>
  </number-filter>
</template>

<script>
import Vue from 'vue'
import { mzFilterPrecision } from '../../../lib/util'
import NumberFilter from './NumberFilter.vue'

export default Vue.extend({
  name: 'MzFilter',
  components: {
    NumberFilter,
  },
  computed: {
    precision() {
      return mzFilterPrecision(this.$attrs.value)
    },
  },
})
</script>
