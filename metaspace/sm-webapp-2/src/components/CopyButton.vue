<template>
  <el-popover
    :key="copied"
    trigger="hover"
    placement="top"
    popper-class="min-w-0"
    @after-leave="copied = false"
  >
    <template #reference>
      <button
        class="button-reset flex"
        :class="`${customClass ? customClass : ''} ${isId ? 'w-6 h-6' : 'w-4 h-4'}`"
        @click="handleCopy"
      >
        <copy-id-icon
          v-if="isId"
          class="h-full w-full text-gray-400 hover:text-gray-500 sm-copy-icon"
        />
        <el-icon
          v-else
          class="h-full w-full text-gray-400 hover:text-gray-500 sm-copy-icon">
         <CopyDocument />
        </el-icon>
      </button>
    </template>
    <p class="leading-none m-0">
      <span v-if="copied" key="copied">
        Copied!
      </span>
      <slot v-else>
        Copy to clipboard
      </slot>
    </p>
  </el-popover>
</template>

<script lang="ts">
import {defineAsyncComponent, defineComponent, ref} from 'vue';
import copyToClipboard from '../lib/copyToClipboard';
import {ElIcon} from "element-plus";
import {CopyDocument} from "@element-plus/icons-vue";

const CopyIdIcon = defineAsyncComponent(() =>
  import('../assets/inline/copy-id.svg')
);


export default defineComponent({
  components: {
    CopyIdIcon,
    CopyDocument,
    ElIcon,
  },
  props: {
    text: { type: String, required: true },
    customClass: { type: String },
    isId: { type: Boolean, default: false },
  },
  setup(props) {
    const copied = ref(false);
    const handleCopy = () => {
      copyToClipboard(props.text);
      copied.value = true;
    };
    return {
      copied,
      handleCopy,
    };
  },
});
</script>

<style scoped>
p {
  font-size: 13px; /* borrowed from Element Tooltip */
}

.sm-copy-icon .primary,
.sm-copy-icon .secondary {
  stroke-width: 2px;
  stroke: currentColor;
  fill: #fff;
}
.sm-copy-icon .secondary {
  fill: theme('colors.gray.100');
}

</style>
