<template>
  <a href="/learn#databases" target="_blank" rel="noopener" class="flex items-start">
    See the Learn page for details
    <stateful-icon class="w-4 h-4 ml-1" active>
      <external-window-svg />
    </stateful-icon>
  </a>
</template>

<script lang="ts">
import { defineAsyncComponent, defineComponent } from 'vue'
import StatefulIcon from '../../../components/StatefulIcon.vue'
const ExternalWindowSvg = defineAsyncComponent(
  () => import('../../../assets/inline/refactoring-ui/icon-external-window.svg')
)
export default defineComponent({
  name: 'YourComponentName', // Replace with your component name
  components: {
    StatefulIcon,
    ExternalWindowSvg,
  },
})
</script>
