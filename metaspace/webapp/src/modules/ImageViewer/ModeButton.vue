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
      <tune-icon
        class="sm-stateful-icon"
        :class="{ 'sm-stateful-icon--active': isActive }"
      />
      <span class="leading-none ml-1">Channels</span>
    </popup-anchor>
  </button>
</template>
<script lang="ts">
import { defineComponent, computed } from '@vue/composition-api'

import PopupAnchor from '../NewFeaturePopup/PopupAnchor.vue'

import '../../components/StatefulIcon.css'
import TuneIcon from '../../assets/inline/refactoring-ui/tune.svg'

import viewerState, { toggleMode } from './state'
import config from '../../lib/config'

export default defineComponent({
  components: {
    TuneIcon,
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
