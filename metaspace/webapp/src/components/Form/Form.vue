<template>
  <form
    v-bind="$attrs"
    action="#"
    @submit.prevent="$listeners.submit"
  >
    <slot />
  </form>
</template>
<script lang="ts">
import Vue from 'vue'
export default Vue.extend({
  // for running in .jsx files
})
</script>
<style scoped>
form >>> .el-input {
  @apply py-1;
}
form >>> .sm-form-error .el-input__inner,
form >>> input:invalid {
  @apply border-danger;
}
</style>
