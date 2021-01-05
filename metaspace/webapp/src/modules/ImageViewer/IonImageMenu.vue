<template>
  <overlay class="overflow-x-hidden overflow-y-auto px-0 sm-menu-items">
    <menu-item
      v-for="item in menuItems"
      :key="item.id"
      v-popover="`popover-${item.id}`"
      class="flex flex-col justify-center"
      :layer-id="item.id"
      :is-active="activeLayer === item.id"
      :visible="item.settings.visible"
      :loading="item.loading"
      @active="setActiveLayer"
      @delete="removeLayer"
      @mousedown.capture="setLastSlider(null)"
      @keydown.capture="setLastSlider(null)"
    >
      <p class="flex justify-between m-0 h-9 items-center">
        <candidate-molecules-popover
          placement="right"
          :visible-arrow="false"
          :limit="10"
          :possible-compounds="item.annotation.possibleCompounds"
          :isomers="item.annotation.isomers"
          :isobars="item.annotation.isobars"
        >
          <molecular-formula
            class="truncate font-medium h-6 text-base proportional-nums pl-3 -ml-3"
            :ion="item.annotation.ion"
          />
        </candidate-molecules-popover>
        <button
          :title="item.settings.visible ? 'Hide layer' : 'Show layer'"
          class="button-reset h-5"
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
      <div class="h-9 relative">
        <ion-intensity-slider
          :id="item.id"
          :model="item.state"
          :color-bar="item.colorBar.value"
          :intensity="item.intensity.value"
          :scale-range="item.scaleRange.value"
          :is-disabled="!item.settings.visible"
          @thumb-start="setLastSlider(item.id)"
          @popover="popover => item.state.popover = popover"
        />
        <channel-selector
          v-model="item.settings.channel"
          class="h-0 absolute bottom-0 left-0 right-0 flex justify-center items-end z-10"
          @remove="removeLayer(item.id)"
        />
      </div>
      <el-popover
        :ref="`popover-${item.id}`"
        :value="!!item.state.popover"
        trigger="manual"
        placement="left"
        popper-class="max-w-measure-2 text-left proportional-nums text-sm leading-5"
        :visible-arrow="false"
      >
        <b>Hot-spot removal has been applied to this image</b>.
        Intensities above the 99ᵗʰ percentile, 3.5e+3, have been reduced to 3.5e+3.
        The highest intensity before hot-spot removal was 3.5e+3.
      </el-popover>
    </menu-item>
    <!-- margin removed below for Safari -->
    <button
      class="button-reset p-3 h-12 w-full cursor-default text-gray-700 text-center m-0"
      :class="{ 'bg-blue-100 text-primary': activeLayer === null }"
      @click="() => setActiveLayer(null)"
    >
      <fade-transition class="text-xs tracking-wide font-medium text-inherit">
        <span
          v-if="activeLayer === null"
          key="active"
        >
          Select annotation
        </span>
        <span
          v-else
          key="inactive"
          class="flex items-center justify-center"
        >
          Add ion image
        </span>
      </fade-transition>
    </button>
  </overlay>
</template>
<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api'

import MenuItem from './MenuItem.vue'
import IonIntensitySlider from './IonIntensitySlider.vue'
import MolecularFormula from '../../components/MolecularFormula'
import Overlay from './Overlay.vue'
import FadeTransition from '../../components/FadeTransition'
import ChannelSelector from './ChannelSelector.vue'
import CandidateMoleculesPopover from '../Annotations/annotation-widgets/CandidateMoleculesPopover.vue'

import '../../components/MonoIcon.css'
import VisibleIcon from '../../assets/inline/refactoring-ui/visible.svg'
import HiddenIcon from '../../assets/inline/refactoring-ui/hidden.svg'

import { useIonImageMenu } from './ionImageState'

export default defineComponent({
  props: {
    menuItems: Array,
  },
  components: {
    MenuItem,
    IonIntensitySlider,
    MolecularFormula,
    VisibleIcon,
    HiddenIcon,
    Overlay,
    FadeTransition,
    ChannelSelector,
    CandidateMoleculesPopover,
  },
  setup(props, { emit }) {
    const { activeLayer, removeLayer, setActiveLayer } = useIonImageMenu()

    const lastSlider = ref<string | null>(null)

    return {
      activeLayer,
      removeLayer,
      setLastSlider(id: string) {
        lastSlider.value = id
      },
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
<style scoped>
.sm-menu-items >>> > * {
  @apply box-border border-0 border-t border-solid border-gray-200;
}
.sm-menu-items >>> > *:last-child {
  @apply border-b;
}
.sm-menu-items >>> > .focus-visible {
  outline: 2px solid theme('colors.primary');
  outline-offset: -2px;
}
.sm-menu-items >>> > *:hover {
  outline: 1px solid theme('colors.primary');
  outline-offset: -1px;
}
</style>
