<template>
  <fade-transition>
    <div
      v-if="mode === 'SINGLE'"
      class="absolute top-0 right-0 mt-3 mr-2 w-60 px-3 box-border bg-gray-100-alpha rounded-lg h-12"
    >
      <ion-intensity-slider
        class="mt-3"
        :layer="menuItems[0].layer"
        :color-bar="menuItems[0].colorBar"
        @change="updateIntensity"
      />
    </div>
    <menu-container v-else>
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
          <ion-intensity-slider
            :layer="layer"
            :color-bar="colorBar"
            @change="updateIntensity"
          />
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
  </fade-transition>
</template>
<script lang="ts">
import { defineComponent, computed } from '@vue/composition-api'

import MenuContainer from './MenuContainer.vue'
import MenuItem from './MenuItem.vue'
import IonIntensitySlider from './IonIntensitySlider.vue'
import MolecularFormula from '../../components/MolecularFormula'
import FadeTransition from '../../components/FadeTransition'

import '../../components/MonoIcon.css'
import VisibleIcon from '../../assets/inline/refactoring-ui/visible.svg'
import HiddenIcon from '../../assets/inline/refactoring-ui/hidden.svg'
import AddIcon from '../../assets/inline/refactoring-ui/add.svg'

import { useIonImageMenu } from './ionImageState'
import viewerState from './state'

export default defineComponent({
  components: {
    MenuContainer,
    MenuItem,
    IonIntensitySlider,
    MolecularFormula,
    VisibleIcon,
    HiddenIcon,
    AddIcon,
    FadeTransition,
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
      menuItems,
      activeLayer,
      setActiveLayer,
      updateIntensity,
      toggleVisibility,
      deleteLayer,
      mode: viewerState.mode,
    }
  },
})
</script>
