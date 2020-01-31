<template>
  <el-input-number
    ref="input"
    class="el-input-number-overrides"
    :controls="false"
    :value="value === null ? undefined : value"
    v-bind="$attrs"
    @input="val => $emit('input', val === undefined ? null : val)"
  />
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'

  /**
   * Wrapper for el-input-number to make it slightly friendlier in forms:
   * - uses null instead of undefined for blank values
   * - has width:100% and is left-aligned like other FormFields
   *
   * Ideally this would also prevent non-numeric input
   */
  @Component({
    inheritAttrs: false,
  })
export default class CustomNumberInput extends Vue {
    @Prop({ default: 0 })
    value!: number | null;
}
</script>
<style lang="scss" scoped>
  .el-input-number-overrides {
    width: 100%;

    &.el-input-number /deep/ .el-input__inner {
      text-align: start;
    }
  }
</style>
