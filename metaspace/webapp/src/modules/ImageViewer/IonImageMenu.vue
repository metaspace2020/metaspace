<template>
  <fade-transition>
    <overlay
      v-if="mode === 'SINGLE' && singleModeMenuItem"
      class="h-12 px-3"
    >
      <ion-intensity-slider
        :model="singleModeMenuItem.state"
        :color-bar="singleModeMenuItem.colorBar"
        @change="singleModeMenuItem.updateIntensity"
      />
    </overlay>
    <menu-container v-if="mode === 'MULTI'">
      <menu-item
        v-for="item in multiModeMenuItems"
        :key="item.id"
        class="flex flex-col justify-center"
        :layer-id="item.id"
        :active-layer="activeLayer"
        :visible="item.settings.visible"
        @active="setActiveLayer"
        @delete="removeLayer"
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
            :model="item.state"
            :color-bar="item.colorBar"
            :is-disabled="!item.settings.visible"
            @change="item.updateIntensity"
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
import Overlay from './Overlay.vue'

import '../../components/MonoIcon.css'
import VisibleIcon from '../../assets/inline/refactoring-ui/visible.svg'
import HiddenIcon from '../../assets/inline/refactoring-ui/hidden.svg'
import AddIcon from '../../assets/inline/refactoring-ui/add.svg'

import { useIonImageMenu } from './ionImageState'
import viewerState from './state'

export default defineComponent({
  props: {
    annotationId: { type: String, required: true },
  },
  components: {
    MenuContainer,
    MenuItem,
    IonIntensitySlider,
    MolecularFormula,
    VisibleIcon,
    HiddenIcon,
    AddIcon,
    FadeTransition,
    Overlay,
  },
  setup(props, { emit }) {
    const {
      activeLayer,
      removeLayer,
      multiModeMenuItems,
      setActiveLayer,
      singleModeMenuItem,
    } = useIonImageMenu(props)

    return {
      activeLayer,
      removeLayer,
      multiModeMenuItems,
      mode: viewerState.mode,
      setActiveLayer,
      singleModeMenuItem,
    }
  },
})
</script>
