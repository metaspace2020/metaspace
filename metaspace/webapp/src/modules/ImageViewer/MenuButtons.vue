<template>
  <div
    class="flex"
    @click.stop
    @keyup.stop
  >
    <button
      v-if="hasOpticalImages"
      title="Optical image controls"
      class="button-reset flex h-6 mr-3"
      :class="{ active: menu === 'OPTICAL' }"
      @click="setMenu('OPTICAL')"
    >
      <stateful-icon
        class="h-6 w-6"
        hover
        :active="menu === 'OPTICAL'"
      >
        <camera-svg />
      </stateful-icon>
    </button>
    <button
      title="Ion image controls"
      class="button-reset flex h-6 mr-3"
      :class="{ active: menu === 'ION' }"
      @click="setMenu('ION')"
    >
      <stateful-icon
        class="h-6 w-6"
        hover
        :active="menu === 'ION'"
      >
        <monitor-svg />
      </stateful-icon>
    </button>
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'

import StatefulIcon from '../../components/StatefulIcon.vue'

import MonitorSvg from '../../assets/inline/refactoring-ui/icon-monitor.svg'
import CameraSvg from '../../assets/inline/refactoring-ui/icon-camera.svg'

import viewerState, { setMenu } from './state'

export default defineComponent({
  props: {
    hasOpticalImages: Boolean,
  },
  components: {
    StatefulIcon,
    MonitorSvg,
    CameraSvg,
  },
  setup() {
    // onBeforeUnmount(() => {
    //   setMenu('NONE')
    // })

    return {
      menu: viewerState.menu,
      setMenu,
    }
  },
})
</script>
<style scoped>
  button {
    position: relative;
  }
  button::after {
    content: '';
    position: absolute;
    top: -4px;
    left: -4px;
    right: -4px;
    bottom: -4px;
    box-sizing: border-box;
    border-style: solid;
    border-color: transparent;
  }
  button.active::after {
    border-bottom-width: 3px;
    border-bottom-color: theme('colors.blue.700');
  }
</style>
