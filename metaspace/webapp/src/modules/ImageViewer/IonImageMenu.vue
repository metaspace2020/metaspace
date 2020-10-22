<template>
  <menu-container>
    <menu-item
      v-for="item in menuItems"
      :key="item.id"
      class="flex flex-col justify-center"
      :layer-id="item.id"
      :active-layer="activeLayer"
      :visible="item.settings.visible"
      @active="setActiveLayer"
      @delete="removeLayer"
      @mousedown.capture="setLastSlider(null)"
      @keydown.capture="setLastSlider(null)"
    >
      <p class="flex justify-between m-0 h-9 items-center">
        <molecular-formula
          class="truncate font-medium h-6 text-base proportional-nums"
          :ion="item.annotation.ion"
        />
        <button
          :title="item.settings.visible ? 'Hide layer' : 'Show layer'"
          class="button-reset h-5 focus-ring-primary"
          @click.stop.left="item.toggleVisibility"
        >
          <visible-icon
            v-if="item.settings.visible"
            class="sm-mono-icon text-gray-800"
          />
          <hidden-icon
            v-else
            class="sm-mono-icon text-gray-600"
          />
        </button>
      </p>
      <div class="h-9">
        <ion-intensity-slider
          v-if="item.colorBar"
          :model="item.state"
          :color-bar="item.colorBar.value"
          :intensity="item.intensity.value"
          :is-disabled="!item.settings.visible"
          @change="item.updateIntensity"
          @thumb-start="setLastSlider(item.id)"
        />
      </div>
    </menu-item>
    <button
      class="button-reset py-6 px-3 w-full"
      :class="{ 'bg-blue-100 text-primary': activeLayer === null }"
      @click="() => setActiveLayer(null)"
    >
      <span class="uppercase text-xs tracking-wider m-0 text-inherit flex items-center justify-end">
        <span
          v-if="activeLayer === null"
          key="active"
        >
          Select row in table
        </span>
        <span
          v-else
          key="inactive"
        >
          Add ion image
        </span>
        <add-icon class="sm-mono-icon ml-1" />
      </span>
    </button>
  </menu-container>
</template>
<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api'

import MenuContainer from './MenuContainer.vue'
import MenuItem from './MenuItem.vue'
import IonIntensitySlider from './IonIntensitySlider.vue'
import MolecularFormula from '../../components/MolecularFormula'
import Overlay from './Overlay.vue'

import '../../components/MonoIcon.css'
import VisibleIcon from '../../assets/inline/refactoring-ui/visible.svg'
import HiddenIcon from '../../assets/inline/refactoring-ui/hidden.svg'
import AddIcon from '../../assets/inline/refactoring-ui/add.svg'

import { useIonImageMenu } from './ionImageState'

export default defineComponent({
  props: {
    menuItems: Array,
  },
  components: {
    MenuContainer,
    MenuItem,
    IonIntensitySlider,
    MolecularFormula,
    VisibleIcon,
    HiddenIcon,
    AddIcon,
    Overlay,
  },
  setup(props, { emit }) {
    const { activeLayer, removeLayer, setActiveLayer } = useIonImageMenu()

    const lastSlider = ref<string | null>(null)
    return {
      setLastSlider(id: string) {
        lastSlider.value = id
      },
      activeLayer,
      removeLayer,
      setActiveLayer(id: string) {
        // do not change the active layer if the slider was used
        if (id !== null && id === lastSlider.value) {
          return
        }
        setActiveLayer(id)
      },
    }
  },
})
</script>
