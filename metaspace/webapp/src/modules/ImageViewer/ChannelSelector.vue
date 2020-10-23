<template>
  <div
    ref="container"
    class="inline-flex w-full justify-around items-center py-1 rounded-full focus-ring-primary"
    tabindex="0"
    @click.stop
    @keypress.enter.self="emit('close')"
    @keypress.esc.self="emit('close')"
  >
    <button
      v-for="channel in channels"
      :key="channel.name"
      :data-active="active === channel.name"
      :title="channel.name"
      class="button-reset rounded-full border border-solid border-gray-400 focus-ring-primary"
      :style="{ background: channel.color }"
      @click="emit('change', channel.name)"
    />
  </div>
</template>
<script lang="ts">
import { defineComponent, ref, onMounted } from '@vue/composition-api'
import { channels } from '../../lib/getColorScale'

export default defineComponent({
  props: {
    active: String,
  },
  setup(_, { emit }) {
    const container = ref<HTMLElement>()

    onMounted(() => {
      if (container.value) {
        container.value.focus()
      }
    })

    return {
      container,
      emit,
      test: () => console.log('test'),
      channels: Object.entries(channels).map(([name, color]) => ({ name, color })),
    }
  },
})
</script>
<style scoped>
  button {
    position: relative;
    width: 14px;
    height: 14px;
  }
  button[data-active] {
    @apply border-primary;
  }
  button::after {
    content: '';
    @apply h-3 w-3 border-solid border-transparent absolute rounded-full;
    border-width: 3px;
    left: -3px;
    top: -3px;
  }
  button[data-active]::after {
    @apply border-primary;
  }
</style>
