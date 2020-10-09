<template>
  <fade-transition>
    <div
      v-if="mode === 'SINGLE'"
      class="absolute top-0 right-0 mt-3 mr-2 w-60 px-3 box-border bg-gray-100-alpha rounded-lg h-12"
    >
      <ion-intensity-slider
        class="mt-3"
        :model="singleModeMenuItem.state"
        :color-bar="singleModeMenuItem.colorBar"
        @change="updateSingleModeIntensity"
      />
    </div>
    <menu-container v-else>
      <menu-item
        v-for="{ state, settings, colorBar } in multiModeMenuItems"
        :key="state.id"
        class="flex flex-col justify-center"
        :layer-id="state.id"
        :active-layer="activeLayer"
        :visible="settings.visible"
        @active="setActiveLayer"
        @delete="deleteLayer"
      >
        <p class="flex justify-between m-0 h-9 items-center">
          <molecular-formula
            class="truncate font-medium h-6 text-base proportional-nums"
            :ion="state.annotation.ion"
          />
          <button
            :title="settings.visible ? 'Hide layer' : 'Show layer'"
            class="button-reset h-5 focus-ring-primary"
            @click.stop.left="toggleVisibility(state.id)"
          >
            <visible-icon
              v-if="settings.visible"
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
            :model="state"
            :color-bar="colorBar"
            :is-disabled="!settings.visible"
            @change="updateLayerIntensity"
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
      activeLayer,
      deleteLayer,
      multiModeMenuItems,
      setActiveLayer,
      singleModeMenuItem,
      toggleVisibility,
      updateLayerIntensity,
      updateSingleModeIntensity,
    } = useIonImageMenu()

    return {
      activeLayer,
      deleteLayer,
      multiModeMenuItems,
      mode: viewerState.mode,
      setActiveLayer,
      singleModeMenuItem,
      toggleVisibility,
      updateLayerIntensity,
      updateSingleModeIntensity,
    }
  },
})
</script>
