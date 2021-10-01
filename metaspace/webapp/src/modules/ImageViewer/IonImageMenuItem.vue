<template>
  <el-popover
    class="block"
    placement="left"
    popper-class="max-w-measure-1 text-left text-sm leading-5"
    trigger="manual"
    :value="clippingNotice.visible"
    :visible-arrow="false"
    :disabled="popupsDisabled"
    @after-leave="clippingNotice.type = null"
  >
    <menu-item
      slot="reference"
      class="flex flex-col justify-center"
      :layer-id="item.id"
      :is-active="isActive"
      :visible="item.settings.visible"
      :loading="item.loading"
      @active="setActiveLayer"
      @remove="removeLayer"
      @mousedown.capture="usedSlider = false"
      @keydown.capture="usedSlider = false"
    >
      <p class="flex justify-between m-0 h-9 items-center">
        <candidate-molecules-popover
          placement="right"
          :limit="10"
          :disabled="popupsDisabled"
          :possible-compounds="item.annotation.possibleCompounds"
          :isomers="item.annotation.isomers"
          :isobars="item.annotation.isobars"
        >
          <molecular-formula
            class="truncate font-medium h-6 text-base"
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
            class="fill-current w-5 h-5 text-gray-800"
          />
          <hidden-icon
            v-else
            class="fill-current w-5 h-5 text-gray-600"
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
          @thumb-start="usedSlider = true; $emit('slider-start')"
          @thumb-stop="$emit('slider-stop')"
          @popover="toggleClippingNotice"
        />
        <channel-selector
          v-model="item.settings.channel"
          class="h-0 absolute bottom-0 left-0 right-0 flex justify-center items-end z-10"
          @remove="removeLayer"
        />
      </div>
    </menu-item>
    <clipping-notice
      v-if="!item.loading"
      :type="clippingNotice.type"
      :is-normalized="isNormalized"
      :intensity="item.intensity.value"
    />
  </el-popover>
</template>
<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api'

import MenuItem from './MenuItem.vue'
import IonIntensitySlider from './IonIntensitySlider.vue'
import MolecularFormula from '../../components/MolecularFormula'
import FadeTransition from '../../components/FadeTransition'
import ChannelSelector from './ChannelSelector.vue'
import CandidateMoleculesPopover from '../Annotations/annotation-widgets/CandidateMoleculesPopover.vue'
import ClippingNotice from './ClippingNotice.vue'

import VisibleIcon from '../../assets/inline/refactoring-ui/icon-view-visible.svg'
import HiddenIcon from '../../assets/inline/refactoring-ui/icon-view-hidden.svg'

import useClippingNotice from './useClippingNotice'

interface Props {
  item: {
    id: string
  },
  isActive: boolean
  popupsDisabled: boolean
}

export default defineComponent<Props>({
  components: {
    MenuItem,
    IonIntensitySlider,
    MolecularFormula,
    VisibleIcon,
    HiddenIcon,
    FadeTransition,
    ChannelSelector,
    CandidateMoleculesPopover,
    ClippingNotice,
  },
  props: {
    item: Object,
    isActive: Boolean,
    isNormalized: Boolean,
    popupsDisabled: Boolean,
  },
  setup(props, { emit }) {
    const usedSlider = ref(false) // to prevent active state changing when using the slider
    const { clippingNotice, toggleClippingNotice } = useClippingNotice()

    return {
      usedSlider,
      clippingNotice,
      toggleClippingNotice,
      setActiveLayer() {
        if (!usedSlider.value) {
          emit('active', props.item.id)
        }
      },
      removeLayer() {
        emit('remove', props.item.id)
      },
    }
  },
})
</script>
