<template>
  <el-tooltip
    v-if="tooltip != null"
    :content="tooltip"
    :placement="tooltipPlacement"
  >
    <span class="notification" />
  </el-tooltip>
  <span
    v-else
    class="notification"
  />
</template>
<script lang="ts">
import Vue from 'vue'
export default Vue.extend({
  props: {
    tooltip: String,
    tooltipPlacement: String,
  },
})
</script>
<style scoped>
  .notification:before {
    @apply w-2 h-2 bg-danger rounded-full ml-1;
    content: '';
    display: inline-block;
    vertical-align: middle;
  }
</style>
