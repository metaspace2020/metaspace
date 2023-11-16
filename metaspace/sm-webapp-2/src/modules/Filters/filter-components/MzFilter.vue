<template>
  <number-filter
    v-bind="$attrs"
    :step="0.0001"
    :raw-input="true"
  >
    <span class="ml-1">
      ± {{ precision }}
    </span>
  </number-filter>
</template>

<script>
import { defineComponent, computed } from 'vue';
import { mzFilterPrecision } from '../../../lib/util';
import NumberFilter from './NumberFilter.vue';

export default defineComponent({
  name: 'MzFilter',
  components: {
    NumberFilter,
  },
  setup(props, { attrs }) {
    // Computed property
    const precision = computed(() => mzFilterPrecision(attrs.value));

    return {
      precision,
    };
  },
});
</script>
