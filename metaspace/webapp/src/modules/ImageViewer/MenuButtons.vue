<template>
  <div
    class="flex"
    @click.stop
    @keyup.stop
  >
    <button
      title="Optical images"
      class="button-reset flex h-6 mr-3 focus-ring-primary"
      :class="{ active: menu === 'OPTICAL' }"
      @click="setMenu('OPTICAL')"
    >
      <camera-icon
        :class="['sm-stateful-icon', { 'sm-stateful-icon--active': menu === 'OPTICAL' }]"
      />
    </button>
    <button
      title="Ion images"
      class="button-reset flex h-6 mr-3 focus-ring-primary"
      :class="{ active: menu === 'ION' }"
      @click="setMenu('ION')"
    >
      <monitor-icon
        :class="['sm-stateful-icon', { 'sm-stateful-icon--active': menu === 'ION' }]"
      />
    </button>
  </div>
</template>
<script lang="ts">
import { defineComponent, onBeforeUnmount } from '@vue/composition-api'

import '../../components/StatefulIcon.css'
import MonitorIcon from '../../assets/inline/refactoring-ui/monitor.svg'
import CameraIcon from '../../assets/inline/refactoring-ui/camera.svg'

import state, { setMenu } from './menuState'

export default defineComponent({
  components: {
    MonitorIcon,
    CameraIcon,
  },
  setup() {
    // onBeforeUnmount(() => {
    //   setMenu('NONE')
    // })

    return {
      menu: state,
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
