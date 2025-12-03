<template>
  <div class="cell-wrapper">
    <candidate-molecules-popover
      class="cell-span"
      placement="right"
      :possible-compounds="annotation.possibleCompounds"
      :limit="10"
      :isomers="annotation.isomers"
      :isobars="annotation.isobars"
    >
      <molecular-formula :ion="annotation.ion" />

      <span v-if="annotation.id in channelSwatches" class="flex">
        <i
          class="block mt-1 w-3 h-3 mx-1 box-content border border-solid border-gray-400 rounded-full"
          :style="{ background: channelSwatches[annotation.id] }"
        />
      </span>
      <span v-if="highlightByIon && annotation.ion in channelSwatchesByIon" class="flex">
        <i
          class="block mt-1 w-3 h-3 mx-1 box-content border border-solid border-gray-400 rounded-full"
          :style="{ background: channelSwatchesByIon[annotation.ion] }"
        />
      </span>
    </candidate-molecules-popover>
    <filter-icon v-if="!hasCompoundNameFilter" class="cell-filter-button" @click="handleFilter">
      <title>Limit results to this molecular formula</title>
    </filter-icon>
  </div>
</template>

<script>
import { defineComponent, computed, defineAsyncComponent } from 'vue'
import { useStore } from 'vuex'
import CandidateMoleculesPopover from './annotation-widgets/CandidateMoleculesPopover.vue'
import MolecularFormula from '../../components/MolecularFormula'
import { useChannelSwatches } from '../ImageViewer/ionImageState'
import useFilter from '../../lib/useFilter'
import { channels as channelToRGB } from '../../lib/getColorScale'

const FilterIcon = defineAsyncComponent(() => import('../../assets/inline/filter.svg'))

/**
 * This table cell has been extracted to minimize redraws of CandidateMoleculePopover.
 * CandidateMoleculePopover accounted for ~10% of the re-render time when switching annotations.
 * Vue seems to unconditionally re-render components when their slots' contents have been re-rendered,
 * even if the slots' contents haven't changed. Moving this into its own component allows Vue to diff on props instead
 * of slot contents, preventing unneeded re-renders.
 */
export default defineComponent({
  name: 'AnnotationTableMolName',
  components: {
    CandidateMoleculesPopover,
    MolecularFormula,
    FilterIcon,
  },
  props: ['annotation', 'highlightByIon'],
  setup(props) {
    const store = useStore()
    const compoundNameFilter = useFilter(store, 'compoundName')
    const hasCompoundNameFilter = computed(() => compoundNameFilter.value != null)
    const handleFilter = () => {
      compoundNameFilter.value = props.annotation.sumFormula
    }
    const orderedLayers = computed(() => store.state.channels)
    const channelSwatchesByIon = computed(() => {
      const swatches = {}
      if (store.state.mode === 'MULTI' && props.highlightByIon) {
        for (const layer of orderedLayers.value) {
          swatches[layer.id] = channelToRGB[layer.settings.channel]
        }
      }
      return swatches
    })

    return {
      hasCompoundNameFilter,
      channelSwatches: useChannelSwatches(),
      channelSwatchesByIon,
      handleFilter,
    }
  },
})
</script>
