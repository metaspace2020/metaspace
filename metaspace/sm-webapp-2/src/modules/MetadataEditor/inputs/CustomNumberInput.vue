<template>
  <el-input-number
    ref="input"
    class="el-input-number-overrides"
    :controls="false"
    :modelValue="computedValue"
    v-bind="$attrs"
    @update:modelValue="handleInput"
  />
</template>

<script lang="ts">
import { defineComponent, toRefs, computed, watch } from 'vue';
/**
 * Wrapper for el-input-number to make it slightly friendlier in forms:
 * - uses null instead of undefined for blank values
 * - has width:100% and is left-aligned like other FormFields
 *
 * Ideally this would also prevent non-numeric input
 */
export default defineComponent({
  name: 'CustomNumberInput',
  inheritAttrs: false,
  props: {
    value: {
      type: Number,
      default: 0
    }
  },
  setup(props, { emit }) {
    const { value } = toRefs(props);
    const computedValue = computed(() => props.value === null ? undefined : props.value);
    const handleInput = (val: number | undefined) => {
      emit('update:modelValue', val === undefined ? null : val);
    };

    watch(value, (newValue) => {
      if (newValue === null || newValue === undefined) {
        emit('update:modelValue', newValue);
      }
    });

    return {
      computedValue,
      handleInput
    };
  }
});
</script>

<style lang="scss" scoped>
.el-input-number-overrides {
  width: 100%;

  &.el-input-number ::v-deep(.el-input__inner) {
    text-align: start;
  }
}
</style>
