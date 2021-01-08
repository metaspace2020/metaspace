<template>
  <menu-item
    v-popover:popoverRef
    class="flex flex-col justify-center"
    :layer-id="item.id"
    :is-active="isActive"
    :visible="item.settings.visible"
    :loading="item.loading"
    @active="setActiveLayer"
    @delete="$emit('delete')"
    @mousedown.capture="sliding = false"
    @keydown.capture="sliding = false"
  >
    <p class="flex justify-between m-0 h-9 items-center">
      <candidate-molecules-popover
        placement="right"
        :limit="10"
        :possible-compounds="item.annotation.possibleCompounds"
        :isomers="item.annotation.isomers"
        :isobars="item.annotation.isobars"
      >
        <molecular-formula
          class="truncate font-medium h-6 text-base proportional-nums"
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
        @thumb-start="sliding = true"
        @popover="togglePopover"
      />
      <channel-selector
        v-model="item.settings.channel"
        class="h-0 absolute bottom-0 left-0 right-0 flex justify-center items-end z-10"
        @remove="removeLayer(item.id)"
      />
    </div>
    <el-popover
      ref="popoverRef"
      :value="popoverState.visible"
      trigger="manual"
      placement="left"
      popper-class="max-w-measure-1 text-left proportional-nums text-sm leading-5"
      :visible-arrow="false"
      @after-leave="popoverState.name = null"
    >
      <p
        v-if="popoverState.name === 'hotspot-removal'"
        class="m-0"
      >
        <b>Hot-spot removal has been applied to this image</b>.
        Intensities above the 99ᵗʰ percentile, {{ maxIntensities.clipped }},
        have been reduced to {{ maxIntensities.clipped }}.
        The highest intensity before hot-spot removal was {{ maxIntensities.original }}.
      </p>
      <p
        v-if="popoverState.name === 'outlier-max'"
        class="m-0"
      >
        <b>Outlier clipping has been applied to this image</b>.
        Intensities above the 99ᵗʰ percentile, {{ maxIntensities.clipped }},
        have been reduced to {{ maxIntensities.clipped }}.
        The highest intensity before outlier clipping was {{ maxIntensities.original }}.
      </p>
      <p
        v-if="popoverState.name === 'outlier-min'"
        class="m-0"
      >
        <b>Outlier clipping has been applied to this image</b>.
        Intensities below the 1ˢᵗ percentile, {{ minIntensities.clipped }},
        have been reduced to {{ minIntensities.clipped }}.
        The lowest intensity before outlier clipping was {{ minIntensities.original }}.
      </p>
    </el-popover>
  </menu-item>
</template>
<script lang="ts">
import { defineComponent, ref, Ref, reactive, computed } from '@vue/composition-api'

import MenuItem from './MenuItem.vue'
import IonIntensitySlider from './IonIntensitySlider.vue'
import MolecularFormula from '../../components/MolecularFormula'
import FadeTransition from '../../components/FadeTransition'
import ChannelSelector from './ChannelSelector.vue'
import CandidateMoleculesPopover from '../Annotations/annotation-widgets/CandidateMoleculesPopover.vue'

import '../../components/MonoIcon.css'
import VisibleIcon from '../../assets/inline/refactoring-ui/visible.svg'
import HiddenIcon from '../../assets/inline/refactoring-ui/hidden.svg'

import { IonImageIntensity } from './ionImageState'

interface Props {
  item: {
    id: string
    intensity: Ref<{
      min: IonImageIntensity
      max: IonImageIntensity
    }>
  },
  isActive: true
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
  },
  props: {
    item: Object,
    isActive: Boolean,
  },
  setup(props, { emit }) {
    const sliding = ref(false)
    const popoverState = reactive({
      name: null as String | null,
      visible: false,
    })
    const intensity = computed(() => props.item.intensity.value)

    const formatIntensities = (intensities: IonImageIntensity) => {
      return {
        clipped: intensities.clipped.toExponential(1),
        original: intensities.image.toExponential(1),
      }
    }

    return {
      sliding,
      popoverState,
      popoverRef: ref(),
      minIntensities: computed(() => formatIntensities(intensity.value.min)),
      maxIntensities: computed(() => formatIntensities(intensity.value.max)),
      togglePopover(name: string | null) {
        if (name === null) {
          // don't remove the name until the popover has faded out
          popoverState.visible = false
        } else if (!sliding.value) {
          popoverState.name = name
          popoverState.visible = true
        }
      },
      setActiveLayer() {
        if (!sliding.value) {
          emit('active', props.item.id)
        }
      },
    }
  },
})
</script>
