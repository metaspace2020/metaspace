<template>
  <form
    v-bind="$attrs"
    action="#"
    @submit.prevent="$listeners.submit"
  >
    <slot />
  </form>
</template>
<style scoped>
form .el-input {
  @apply py-1;
}
.sm-form-error .el-input__inner,
form input:invalid {
  @apply border-danger;
}
</style>
