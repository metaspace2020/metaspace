<template>
  <el-switch
    v-bind="$attrs"
    :width="28"
    @change="$emit('change')"
  />
</template>
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
