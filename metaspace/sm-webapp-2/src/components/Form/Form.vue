<template>
  <form
    v-bind="attrs"
    action="#"
    @submit.prevent="emit('submit')"
  >
    <slot />
  </form>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'FormComponent',
  emits: ['submit'],
  setup(props, { emit, attrs }) {
    return {
      attrs,
      emit,
    };
  },
});
</script>

<style scoped>
form ::v-deep(.el-input) {
  @apply py-1;
}

form ::v-deep(.sm-form-error .el-input__inner),
form ::v-deep(input:invalid) {
  @apply border-danger;
}
</style>
