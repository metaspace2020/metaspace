<template>
  <el-tooltip v-if="tooltip != null" :content="tooltip" :placement="tooltipPlacement">
    <span class="notification" />
  </el-tooltip>
  <span v-else class="notification" />
</template>
<script>
  export default {
    props: {
      tooltip: String,
      tooltipPlacement: String
    }
  }
</script>
<style scoped lang="scss">
  @import "~element-ui/packages/theme-chalk/src/common/var";
  .notification:before {
    content: '';
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 5px;
    margin-left: 4px;
    vertical-align: middle;
    background-color: $--color-success;
  }
</style>
