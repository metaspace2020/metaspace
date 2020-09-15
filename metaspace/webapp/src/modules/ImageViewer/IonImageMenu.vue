<template>
  <menu-container>
    <menu-item
      v-for="(layer, i) in layers"
      :key="layer.id"
      class="flex flex-col justify-center"
      :layer-id="layer.id"
      :active-layer="activeLayer"
      :visible="layer.visible"
      @active="setActiveLayer"
      @delete="deleteLayer"
    >
      <p class="flex justify-between m-0 h-9 items-center">
        <molecular-formula
          class="truncate font-medium h-6 text-base"
          :ion="layer.annotation.ion"
        />
        <button
          class="button-reset h-5"
          @click.stop="toggleVisibility(layer.id)"
        >
          <visible-icon
            v-if="layer.visible"
            class="sm-mono-icon text-gray-800"
          />
          <hidden-icon
            v-else
            class="sm-mono-icon text-gray-600"
          />
        </button>
      </p>
      <div class="h-9">
        <range-slider
          :style="{ backgroundImage: backgrounds[i] }"
          :min="0"
          :max="1"
          :step="0.01"
          :value="layer.quantileRange"
          :disabled="!layer.visible"
          @change="range => onInput(layer.id, range)"
        />
        <div class="flex justify-between leading-6 text-sm">
          <span>{{ layer.minIntensity.toExponential(1) }}</span>
          <span>{{ layer.maxIntensity.toExponential(1) }}</span>
        </div>
      </div>
    </menu-item>
    <menu-item
      class="flex items-center justify-end"
      tabindex="0"
      :layer-id="null"
      :active-layer="activeLayer"
      @active="setActiveLayer"
    >
      <p class="uppercase text-xs tracking-wider m-0 text-gray-800">
        Add ion image
      </p>
      <add-icon class="sm-mono-icon text-gray-700 mx-1" />
    </menu-item>
  </menu-container>
</template>
<script lang="ts">
import { defineComponent, computed } from '@vue/composition-api'

import MenuContainer from './MenuContainer.vue'
import MenuItem from './MenuItem.vue'
import RangeSlider from '../../components/RangeSlider.vue'
import MolecularFormula from '../../components/MolecularFormula'

import getColorScale from '../../lib/getColorScale'

import '../../components/MonoIcon.css'
import VisibleIcon from '../../assets/inline/refactoring-ui/visible.svg'
import HiddenIcon from '../../assets/inline/refactoring-ui/hidden.svg'
import AddIcon from '../../assets/inline/refactoring-ui/add.svg'

interface Layer {
  channel: string,
  quantileRange: [number, number],
}

interface Props {
  layers: Layer[]
  activeLayer: string
}

export default defineComponent<Props>({
  components: {
    MenuContainer,
    MenuItem,
    RangeSlider,
    MolecularFormula,
    VisibleIcon,
    HiddenIcon,
    AddIcon,
  },
  props: {
    layers: Array,
    activeLayer: String,
  },
  setup(props, { emit }) {
    const backgrounds = computed(() => {
      if (!props.layers) return []

      return props.layers.map(({ channel, quantileRange }) => {
        const { domain, range } = getColorScale(channel)
        const [minQuantile, maxQuantile] = quantileRange
        const colors = []
        if (minQuantile > 0) {
          colors.push(`${range[0]} 0%`)
        }
        for (let i = 0; i < domain.length; i++) {
          const pct = (minQuantile + (domain[i] * (maxQuantile - minQuantile))) * 100
          colors.push(range[i] + ' ' + (pct + '%'))
        }
        return `linear-gradient(to right, ${colors.join(', ')})`
      })
    })

    return {
      backgrounds,
      onInput: (layerId: string, range: [number, number]) => emit('range', layerId, range),
      selectedLayer: '1',
      toggleVisibility: (layerId: string) => emit('visible', layerId),
      setActiveLayer: (layerId: string | null) => emit('active', layerId),
      deleteLayer: (layerId: string | null) => emit('delete', layerId),
    }
  },
})
</script>
<style scoped>
sub {
  line-height: 1
}
</style>
