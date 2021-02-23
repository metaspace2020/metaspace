<template>
  <a
    href="/help#databases"
    target="_blank"
    rel="noopener"
    class="flex items-start"
  >
    See the Help page for details
    <stateful-icon
      class="w-4 h-4 ml-1"
      active
    >
      <external-window-svg />
    </stateful-icon>
  </a>
</template>
<script lang="ts">
import Vue from 'vue'

import StatefulIcon from '../../../components/StatefulIcon.vue'
import ExternalWindowSvg from '../../../assets/inline/refactoring-ui/icon-external-window.svg'

export default Vue.extend({
  components: {
    StatefulIcon,
    ExternalWindowSvg,
  },
})
</script>
