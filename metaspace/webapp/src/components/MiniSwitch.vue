<template>
  <el-switch
    v-bind="$props"
    :width="28"
    @change="emit('change')"
  />
</template>
<script lang="ts">
import Vue from 'vue'

export default Vue.extend({
  props: {
    disabled: Boolean,
    value: Boolean,
  },
  setup(_, { emit }) {
    return {
      emit,
    }
  },
})
</script>
<style scoped>
  .el-switch >>> .el-switch__core {
    height: 14px;
  }
  .el-switch >>> .el-switch__core::after {
    width: 10px;
    height: 10px;
  }
  .el-switch.is-checked >>> .el-switch__core::after {
    margin-left: -11px;
  }
</style>
