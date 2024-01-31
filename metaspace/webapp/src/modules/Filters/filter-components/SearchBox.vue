<template>
  <el-input
    :value="value"
    class="tf-outer w-auto"
    type="text"
    placeholder="Enter keywords"
    @input="onChange"
  >
    <div slot="prepend">
      <el-tooltip placement="bottom">
        <span slot="content">
          You can use
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Cheatsheet"
            target="_blank"
          >regular expression syntax</a> when searching for the dataset name.
        </span>
        <i
          class="el-icon-search -mx-1"
        />
      </el-tooltip>
    </div>
  </el-input>
</template>

<script lang="ts">
import Vue, { ComponentOptions } from 'vue'

 interface SearchBox extends Vue {
   name: string
   value: string
   removable: boolean
   onChange(val: string): void
   destroy(): void
 }

export default {
  name: 'search-box',
  props: {
    value: String,
    removable: { type: Boolean, default: true },
  },
  methods: {
    onChange(val) {
      this.$emit('input', val)
      this.$emit('change', val)
    },
    destroy() {
      this.$emit('destroy', this.name)
    },
  },
} as ComponentOptions<SearchBox>
</script>
<style>
  .tf-outer .el-input__inner {
    width: 200px; /* IE11 fix - inputs without a "width" won't follow flex-shrink rules */
  }
</style>
