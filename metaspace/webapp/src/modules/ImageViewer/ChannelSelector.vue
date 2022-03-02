<template>
  <div
    ref="clickContainer"
    @click.stop
  >
    <button
      title="More options"
      class="button-reset h-3 w-6 rounded-full box-content sm-more-button"
      :class="isOpen ? 'text-blue-700 bg-blue-200' : 'text-gray-800 hover:bg-gray-200'"
      @click="isOpen = !isOpen"
    >
      <!-- Safari does not support flex on buttons -->
      <span class="flex items-center justify-center h-full">
        <dots-icon class="fill-current w-6 h-6" />
      </span>
    </button>
    <fade-transition>
      <div
        v-if="isOpen"
        class="channel-popover absolute top-0 w-full mt-1 shadow rounded-md bg-gray-100 p-1 text-center z-10"
      >
        <div class="flex w-full justify-around items-center my-1">
          <button
            v-for="channel in channels"
            :key="channel.name"
            :title="channel.name"
            class="button-reset rounded-full border border-solid sm-channel-button"
            :class="value === channel.name ? 'border-primary' : 'border-gray-400'"
            :style="{ background: channel.color }"
            @click="$emit('input', channel.name)"
          />
        </div>
        <button
          class="button-reset text-danger h-3 leading-none text-xs tracking-wide font-medium"
          @click="isOpen = !isOpen;$emit('remove')"
        >
          remove
        </button>
      </div>
    </fade-transition>
  </div>
</template>
<script lang="ts">
import { defineComponent, ref, watch, onBeforeUnmount } from '@vue/composition-api'

import FadeTransition from '../../components/FadeTransition'
import DotsIcon from '../../assets/inline/refactoring-ui/icon-dots-horizontal.svg'

import { channels } from '../../lib/getColorScale'
import useOutClick from '../../lib/useOutClick'

export default defineComponent({
  components: {
    FadeTransition,
    DotsIcon,
  },
  props: {
    value: String,
  },
  setup(_, { emit }) {
    const clickContainer = ref<HTMLElement>()
    const isOpen = ref(false)

    let removeEventListeners: (() => void) | null
    watch(isOpen, value => {
      if (value === true) {
        removeEventListeners = useOutClick(() => { isOpen.value = false }, clickContainer)
      } else if (removeEventListeners) {
        removeEventListeners()
        removeEventListeners = null
      }
    })

    onBeforeUnmount(() => {
      if (removeEventListeners) {
        removeEventListeners()
      }
    })

    return {
      clickContainer,
      isOpen,
      channels: Object.entries(channels).map(([name, color]) => ({ name, color })),
      closeDropdown() {
        isOpen.value = false
      },
    }
  },
})
</script>
<style scoped>
  .sm-channel-button {
    position: relative;
    width: 14px;
    height: 14px;
  }
  .sm-channel-button::after {
    content: '';
    @apply h-3 w-3 border-solid border-transparent absolute rounded-full;
    border-width: 3px;
    left: -3px;
    top: -3px;
  }
  .sm-channel-button.border-primary::after {
    @apply border-primary;
  }

  .sm-more-button {
    margin-bottom: 2px;
    padding: 0 1px;
  }
</style>
