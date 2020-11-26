<template>
  <div
    ref="container"
    class="flex w-full justify-around items-center"
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
    return {
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
    @apply h-3 w-3 border-solid border-transparent absolute rounded-full;
    border-width: 3px;
    left: -3px;
    top: -3px;
  }
  button.border-primary::after {
    @apply border-primary;
  }
</style>
