<template>
  <el-popover
    :key="copied"
    class="cursor-help"
    trigger="hover"
    placement="bottom"
    popper-class="min-w-0"
    @after-leave="copied = false"
  >
    <button
      slot="reference"
      class="button-reset w-6 h-6 flex"
      @click="handleCopy"
    >
      <duplicate-icon class="h-full w-full text-gray-400 sm-copy-icon" />
    </button>
    <fade-transition class="leading-5 m-0">
      <p
        v-if="copied"
        key="copied"
      >
        Copied!
      </p>
      <p v-else>
        <slot>Copy to clipboard</slot>
      </p>
    </fade-transition>
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
