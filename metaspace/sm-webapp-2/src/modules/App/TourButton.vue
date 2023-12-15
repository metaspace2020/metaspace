<template>
  <button
    class="button-reset text-primary flex items-center p-0"
    @click="emitClick"
  >
    <span class="mr-2 text-sm font-medium">Take the tour</span>
    <el-icon class="el-icon-caret-right rounded-full transition-colors duration-150 ease-in-out p-1 -my-1"><CaretRight /></el-icon>
  </button>
</template>

<script>
import { defineComponent, getCurrentInstance } from 'vue';
import {ElIcon} from "element-plus";
import {CaretRight} from "@element-plus/icons-vue";
export default defineComponent({
  name: 'TourButton',
  components: {
    ElIcon,
    CaretRight,
  },
  setup() {
    const { emit } = getCurrentInstance();

    const emitClick = () => {
      emit('click');
    };

    return {
      emitClick
    };
  }
});
</script>

<style scoped>
.button-reset:hover i,
.button-reset:focus i {
  @apply bg-primary text-white;
}
</style>
