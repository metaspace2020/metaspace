<template>
  <menu-container>
    <div
      v-for="layer in layers"
      :key="layer.id"
      class="px-3 flex flex-col justify-center h-18"
      :class="{ 'bg-blue-100': selectedLayer === layer.id }"
    >
      <p class="flex justify-between text-sm m-0">
        <span class="truncate font-medium h-6">
          Layer {{ layers.indexOf(layer) + 1 }}
        </span>
        <button class="button-reset">
          <i class="el-icon-visible" />
        </button>
      </p>
      <el-slider
        class="h-3 -mt-3 mb-3"
        :min="layer.minIntensity"
        :max="layer.maxIntensity"
        :v-model="layer.intensityRange"
        range
        @change="range => onChange(layer.id, range)"
      />
      <div class="flex justify-between leading-6 text-xs tracking-wider">
        <span>{{ layer.minIntensity.toExponential(1) }}</span>
        <span>{{ layer.maxIntensity.toExponential(1) }}</span>
      </div>
    </div>
  </menu-container>
</template>
<script lang="ts">
import { defineComponent, onUpdated } from '@vue/composition-api'

import MenuContainer from './MenuContainer.vue'

export default defineComponent({
  components: {
    MenuContainer,
  },
  props: {
    layers: Array,
  },
  setup(props, { emit }) {
    onUpdated(() => {
      console.log(props)
    })
    return {
      onChange: (...args: any) => emit('change', ...args),
    }
  },
})
</script>
<style scoped>
sub {
  line-height: 1
}
</style>
