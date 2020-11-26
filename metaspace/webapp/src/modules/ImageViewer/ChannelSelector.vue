<template>
  <div
    ref="container"
    class="flex w-full justify-around items-center"
    tabindex="0"
    @click.stop
    @keypress.enter.self="$emit('close')"
    @keypress.esc.self="$emit('close')"
  >
    <button
      v-for="channel in channels"
      :key="channel.name"
      :title="channel.name"
      class="button-reset rounded-full border border-solid"
      :class="value === channel.name ? 'border-primary' : 'border-gray-400'"
      :style="{ background: channel.color }"
      @click="$emit('input', channel.name)"
    />
  </div>
</template>
<script lang="ts">
import { defineComponent, ref, onMounted } from '@vue/composition-api'
import { channels } from '../../lib/getColorScale'

export default defineComponent({
  props: {
    value: String,
  },
  setup() {
    const container = ref<HTMLElement>()

    onMounted(() => {
      if (container.value) {
        container.value.focus()
      }
    })

    return {
      container,
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
  button::after {
    content: '';
    @apply h-5 w-5 border-solid border-transparent absolute rounded-full;
    border-width: 3px;
    left: -7px;
    top: -7px;
  }
  button.border-primary::after {
    @apply border-primary;
  }
</style>
