<template>
  <div
    :class="[
      'px-3 h-21 outline-none',
      {
        'bg-blue-100-alpha': activeLayer === layerId,
        'text-gray-700': !visible
      }
    ]"
    tabindex="0"
    @keyup.enter.self="emitActive"
    @keyup.space.self.prevent="emitActive"
    @click.stop="emitActive"
    @keyup.self.delete="emitDelete"
    @click.middle="emitDelete"
    @mousedown.capture="$emit('mousedown')"
    @keydown.capture="$emit('keydown')"
  >
    <fade-transition>
      <p
        v-if="loading"
        key="loading"
        class="m-0 text-xs tracking-wider uppercase"
      >
        loading image ...
      </p>
      <div v-else>
        <slot />
      </div>
    </fade-transition>
  </div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'

import FadeTransition from '../../components/FadeTransition'

export default defineComponent({
  components: {
    FadeTransition,
  },
  props: {
    activeLayer: String,
    layerId: String,
    visible: { type: Boolean, default: true },
    loading: { type: Boolean, default: true },
  },
  setup(props, { emit }) {
    return {
      emitActive: () => emit('active', props.layerId),
      emitDelete: () => emit('delete', props.layerId),
    }
  },
})
</script>
