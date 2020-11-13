<template>
  <div
    ref="container"
    class="-m-1"
    @click.stop
  >
    <div
      v-for="(channels, i) in rows"
      :key="i"
      class="flex"
    >
      <button
        v-for="channel in channels"
        :key="channel.name"
        :title="channel.name"
        class="button-reset rounded-full border border-solid m-1 relative"
        :class="value === channel.name ? 'border-primary' : 'border-gray-400'"
        :style="{ background: channel.color }"
        @click="$emit('input', channel.name)"
        @keyup.enter.self="$emit('close')"
        @keyup.esc.self="$emit('close')"
      />
    </div>
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

    const mapToNameAndColor = (name: string) => ({ name, color: channels[name] })

    return {
      container,
      rows: [
        ['red', 'green', 'blue', 'orange'].map(mapToNameAndColor),
        ['cyan', 'magenta', 'yellow', 'white'].map(mapToNameAndColor),
      ],
    }
  },
})
</script>
<style scoped>
  button {
    width: 14px;
    height: 14px;
  }
  button::after {
    content: '';
    @apply h-full w-full p-1 border-solid border-transparent absolute rounded-full;
    border-width: 3px;
    left: -7px;
    top: -7px;
  }
  button.border-primary::after {
    @apply border-primary;
  }
</style>
