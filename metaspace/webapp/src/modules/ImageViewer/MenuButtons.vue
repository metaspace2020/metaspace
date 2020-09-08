<template>
  <div
    class="flex flex-row-reverse"
    @click="stopPropagation"
  >
    <button
      class="button-reset flex h-6 mr-3"
      @click="setMenu('ION')"
    >
      <monitor-icon
        :class="['sm-stateful-icon', { 'sm-stateful-icon--active': menu === 'ION' }]"
      />
    </button>
    <button
      class="button-reset flex h-6 mr-3"
      @click="setMenu('OPTICAL')"
    >
      <camera-icon
        :class="['sm-stateful-icon', { 'sm-stateful-icon--active': menu === 'OPTICAL' }]"
      />
    </button>
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'

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
    return {
      menu: state,
      setMenu,
      stopPropagation: (e: MouseEvent) => e.stopPropagation(),
    }
  },
})
</script>
