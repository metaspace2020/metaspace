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
      <span
        v-html="molFormulaHtml"
      />
      <span
        v-if="annotation.id in channelSwatches"
        class="flex"
      >
        <i
          class="block mt-1 w-3 h-3 mx-1 box-content border border-solid border-gray-400 rounded-full"
          :style="{ background: channelSwatches[annotation.id] }"
        />
      </span>
    </candidate-molecules-popover>
    <filter-icon
      v-if="!hasCompoundNameFilter"
      class="cell-filter-button"
      @click="handleFilter"
    >
      <title>Limit results to this molecular formula</title>
    </filter-icon>
  </div>
</template>

<script>
import Vue from 'vue'
import { defineComponent, computed } from '@vue/composition-api'

import FilterIcon from '../../assets/inline/refactoring-ui/filter.svg'
import CandidateMoleculesPopover from './annotation-widgets/CandidateMoleculesPopover.vue'
import { useChannelSwatches } from '../ImageViewer/ionImageState'
import { renderMolFormulaHtml } from '../../lib/util'
import useFilter from '../../lib/useFilter'

const channelSwatches = useChannelSwatches()

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
    FilterIcon,
  },
  props: ['annotation'],
  setup(props, { root }) {
    const compoundNameFilter = useFilter(root.$store, 'compoundName')
    const hasCompoundNameFilter = computed(() => compoundNameFilter.value != null)
    const molFormulaHtml = computed(() => renderMolFormulaHtml(props.annotation.ion))
    const handleFilter = () => { compoundNameFilter.value = props.annotation.sumFormula }

    return {
      hasCompoundNameFilter,
      molFormulaHtml,
      channelSwatches,
      handleFilter,
    }
  },
})
</script>
