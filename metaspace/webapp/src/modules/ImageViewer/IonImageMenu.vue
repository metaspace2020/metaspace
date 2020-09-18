<template>
  <menu-container>
    <menu-item
      v-for="{ layer, colorBar } in menuItems"
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
          class="truncate font-medium h-6 text-base proportional-nums"
          :ion="layer.annotation.ion"
        />
        <button
          :title="layer.visible ? 'Hide layer' : 'Show layer'"
          class="button-reset h-5 focus-ring-primary"
          @click.stop.left="toggleVisibility(layer.id)"
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
          :style="colorBar.background"
          :min-color="colorBar.minColor"
          :max-color="colorBar.maxColor"
          :min="0"
          :max="1"
          :step="0.01"
          :value="layer.quantileRange"
          :disabled="!layer.visible"
          :min-tooltip="tooltip(layer, 0)"
          :max-tooltip="tooltip(layer, 1)"
          @change="range => updateIntensity(layer.id, range)"
        />
        <div class="flex justify-between leading-6 tracking-wide">
          <span>{{ layer.minIntensity.toExponential(1) }}</span>
          <span>{{ layer.maxIntensity.toExponential(1) }}</span>
        </div>
      </div>
    </menu-item>
    <button
      class="button-reset py-6 px-3 w-full"
      :class="{ 'text-primary': activeLayer === null }"
      @click="() => setActiveLayer(null)"
    >
      <p class="uppercase text-xs tracking-wider m-0 text-inherit flex items-center justify-end">
        <span class="leading-5">Add ion image</span>
        <add-icon class="sm-mono-icon mx-1" />
      </p>
    </button>
  </menu-container>
</template>
<script lang="ts">
import { defineComponent, computed } from '@vue/composition-api'

import MenuContainer from './MenuContainer.vue'
import MenuItem from './MenuItem.vue'
import RangeSlider from '../../components/RangeSlider.vue'
import MolecularFormula from '../../components/MolecularFormula'

import '../../components/MonoIcon.css'
import VisibleIcon from '../../assets/inline/refactoring-ui/visible.svg'
import HiddenIcon from '../../assets/inline/refactoring-ui/hidden.svg'
import AddIcon from '../../assets/inline/refactoring-ui/add.svg'

import { useIonImageMenu } from './ionImageState'

const tooltip = (layer: any, quantileIndex: number) => {
  const { minIntensity, maxIntensity, quantileRange } = layer
  return (
    minIntensity + ((maxIntensity - minIntensity) * quantileRange[quantileIndex])
  ).toExponential(1)
}

export default defineComponent({
  components: {
    MenuContainer,
    MenuItem,
    RangeSlider,
    MolecularFormula,
    VisibleIcon,
    HiddenIcon,
    AddIcon,
  },
  setup(props, { emit }) {
    const {
      menuItems,
      activeLayer,
      setActiveLayer,
      updateIntensity,
      toggleVisibility,
      deleteLayer,
    } = useIonImageMenu()

    return {
      tooltip,
      menuItems,
      activeLayer,
      setActiveLayer,
      updateIntensity,
      toggleVisibility,
      deleteLayer,
    }
  },
})
</script>
