<template>
  <menu-container>
    <div
      v-for="(layer, i) in layers"
      :key="layer.id"
      class="px-3 flex flex-col justify-center h-18"
      :class="{ 'bg-blue-100': selectedLayer === layer.id }"
    >
      <p class="flex justify-between text-sm m-0">
        <span class="truncate font-medium h-6">
          Layer {{ i + 1 }}
        </span>
        <button class="button-reset">
          <i class="el-icon-visible" />
        </button>
      </p>
      <range-slider
        :style="{ backgroundImage: backgrounds[i] }"
        :min="layer.minIntensity"
        :max="layer.maxIntensity"
        :value="layer.intensityRange"
        @change="range => onInput(layer.id, range)"
      />
      <div class="flex justify-between leading-6 text-sm">
        <span>{{ layer.minIntensity.toExponential(1) }}</span>
        <span>{{ layer.maxIntensity.toExponential(1) }}</span>
      </div>
    </div>
  </menu-container>
</template>
<script lang="ts">
import { defineComponent, computed } from '@vue/composition-api'

import MenuContainer from './MenuContainer.vue'
import RangeSlider from '../../components/RangeSlider.vue'

import getColorScale from '../../lib/getColorScale'

interface Props {
  layers: { channel: string }[]
}

export default defineComponent<Props>({
  components: {
    MenuContainer,
    RangeSlider,
  },
  props: {
    layers: Array,
  },
  setup(props, { emit }) {
    const backgrounds = computed(() => {
      if (!props.layers) return []

      return props.layers.map(({ channel }) => {
        const { domain, range } = getColorScale(channel)
        const colors = []
        for (let i = 0; i < domain.length; i++) {
          colors.push(range[i] + ' ' + (domain[i] * 100 + '%'))
        }
        return `linear-gradient(to right, ${colors.join(', ')})`
      })
    })

    return {
      backgrounds,
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
