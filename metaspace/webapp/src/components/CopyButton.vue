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
      class="button-reset w-4 h-4 flex"
      @click="handleCopy"
    >
      <duplicate-icon class="h-full w-full text-gray-400 hover:text-gray-500 sm-copy-icon" />
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
import DuplicateIcon from '../assets/inline/refactoring-ui/duplicate.svg'
import FadeTransition from './FadeTransition'

interface Props {
  text: string
}

export default defineComponent<Props>({
  components: {
    DuplicateIcon,
    FadeTransition,
  },
  props: {
    text: { type: String, required: true },
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
  .sm-copy-icon .primary {
    fill: theme('colors.gray.100')
  }
</style>
