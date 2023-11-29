<template>
  <el-input
    :modelValue="value"
    class="tf-outer w-auto"
    type="text"
    placeholder="Enter keywords"
    @update:modelValue="onChange"
  >
    <template #prepend>
      <el-tooltip placement="bottom">
        <template #content>
          You can use
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Cheatsheet"
            target="_blank"
          >regular expression syntax</a> when searching for the dataset name.
        </template>
        <el-icon class="-mx-1">
          <Search />
        </el-icon>
      </el-tooltip>
    </template>
  </el-input>
</template>
<script lang="ts">
import { defineComponent } from 'vue';
import {Search} from "@element-plus/icons-vue";
import { ElInput } from 'element-plus';

export default defineComponent({
  components: {
    Search,
    ElInput
  },
  name: 'SearchBox',
  props: {
    value: String,
    removable: {
      type: Boolean,
      default: true
    },
  },
  emits: ['input', 'change', 'destroy'],
  setup(props, { emit }) {
    const onChange = (val: string) => {
      emit('input', val);
      emit('change', val);
    };

    const destroy = () => {
      emit('destroy', name);
    };

    return { onChange, destroy };
  }
});
</script>

<style>
  .tf-outer .el-input__inner {
    width: 200px; /* IE11 fix - inputs without a "width" won't follow flex-shrink rules */
  }
</style>
