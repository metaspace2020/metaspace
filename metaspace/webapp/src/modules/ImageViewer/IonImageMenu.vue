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
      <slider
        :style="{ backgroundImage: layer.background }"
        :min="layer.minIntensity"
        :max="layer.maxIntensity"
        :value="layer.intensityRange"
        @change="range => onInput(layer.id, range)"
      />
      <div class="flex justify-between leading-6 text-xs tracking-wider">
        <span>{{ layer.minIntensity.toExponential(1) }}</span>
        <span>{{ layer.maxIntensity.toExponential(1) }}</span>
      </div>
    </div>
    <!-- <slider
      :value="[0, 100]"
      @change="change"
    /> -->
  </menu-container>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'

import MenuContainer from './MenuContainer.vue'
import Slider from '../../components/Slider.vue'

export default defineComponent({
  components: {
    MenuContainer,
    Slider,
  },
  props: {
    layers: Array,
  },
  setup(props, { emit }) {
    return {
      onInput: (...args: any) => emit('input', ...args),
      selectedLayer: '1',
      change: (v: any) => console.log(v),
    }
  },
})
</script>
<style scoped>
sub {
  line-height: 1
}
</style>
