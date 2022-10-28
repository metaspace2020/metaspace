<template>
  <el-popover
    :key="copied"
    trigger="hover"
    placement="top"
    popper-class="min-w-0"
    @after-leave="copied = false"
  >
    <button
      slot="reference"
      class="button-reset flex"
      :class="`${customClass ? customClass : ''} ${isId ? 'w-6 h-6' : 'w-4 h-4'}`"
      @click="handleCopy"
    >
      <copy-id-icon
        v-if="isId"
        class="h-full w-full text-gray-400 hover:text-gray-500 sm-copy-icon"
      />
      <duplicate-icon
        v-else
        class="h-full w-full text-gray-400 hover:text-gray-500 sm-copy-icon"
      />
    </button>
    <p class="leading-none m-0">
      <span
        v-if="copied"
        key="copied"
      >
        Copied!
      </span>
      <slot v-else>
        Copy to clipboard
      </slot>
    </p>
  </el-popover>
</template>
<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api'

import copyToClipboard from '../lib/copyToClipboard'
import DuplicateIcon from '../assets/inline/refactoring-ui/icon-duplicate.svg'
import CopyIdIcon from '../assets/inline/copy-id.svg'
import FadeTransition from './FadeTransition'

interface Props {
  text: string
}

export default defineComponent<Props>({
  components: {
    DuplicateIcon,
    CopyIdIcon,
    FadeTransition,
  },
  props: {
    text: { type: String, required: true },
    customClass: { type: String },
    isId: { type: Boolean, required: false, default: false },
  },
  setup(props) {
    const copied = ref(false)
    return {
      copied,
      handleCopy() {
        copyToClipboard(props.text)
        copied.value = true
      },
    }
  },
})
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
    fill: theme('colors.gray.100')
  }
</style>
