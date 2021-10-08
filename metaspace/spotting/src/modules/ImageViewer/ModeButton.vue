<template>
  <button
    :title="`${isActive ? 'Disable' : 'Enable'} ion image channels`"
    class="button-reset h-9 rounded-lg flex items-center justify-center px-2 hover:bg-gray-100"
    :class="{ 'text-blue-700': isActive }"
    @click="onClick"
  >
    <popup-anchor
      feature-key="multipleIonImages"
      placement="bottom"
      :show-until="new Date('2021-03-01')"
      class="flex items-center"
    >
      <stateful-icon
        class="h-6 w-6"
        :active="isActive"
      >
        <tune-svg />
      </stateful-icon>
      <span class="leading-none ml-1">Channels</span>
    </popup-anchor>
  </button>
</template>
<script lang="ts">
import { defineComponent, computed } from '@vue/composition-api'

import PopupAnchor from '../NewFeaturePopup/PopupAnchor.vue'
import StatefulIcon from '../../components/StatefulIcon.vue'

import TuneSvg from '../../assets/inline/refactoring-ui/icon-tune.svg'

import viewerState, { toggleMode } from './state'

export default defineComponent({
  components: {
    StatefulIcon,
    TuneSvg,
    PopupAnchor,
  },
  setup(_, { emit }) {
    const isActive = computed(() => viewerState.mode.value === 'MULTI')
    return {
      isActive,
      onClick() {
        toggleMode()
        if (isActive.value === true) {
          emit('multi')
        }
      },
    }
  },
})
</script>
