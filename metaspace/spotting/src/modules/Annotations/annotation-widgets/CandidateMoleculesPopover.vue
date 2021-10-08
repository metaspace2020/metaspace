<template>
  <el-popover
    ref="popover"
    trigger="hover"
    v-bind="$attrs"
  >
    <div class="leading-5 py-2 px-3 font-normal content text-sm text-left">
      <p
        v-if="possibleCompounds.length > 1"
        class="title"
      >
        {{ possibleCompounds.length }} candidate molecules
      </p>
      <p
        v-if="possibleCompounds.length === 1"
        class="title"
      >
        Candidate molecule
      </p>
      <ul class="p-0 list-none leading-7">
        <li
          v-for="(comp, i) in filteredCompounds"
          :key="i"
        >
          {{ comp.name }}
        </li>
        <li
          v-if="moreCount"
          class="text-xs tracking-wide font-medium"
        >
          + {{ moreCount }} more
        </li>
      </ul>
      <div
        v-if="showIsomers"
      >
        <p class="title">
          <span v-if="isomers.length == 1">An isomeric ion was annotated</span>
          <span v-else>{{ isomers.length }} isomeric ions were annotated</span>
        </p>
        <p>
          Check the <b>Molecules</b> panel for more candidates.
        </p>
      </div>
      <div
        v-if="showIsobars"
      >
        <p class="title">
          <span v-if="isobars.length == 1">An isobaric ion was annotated</span>
          <span v-else>{{ isobars.length }} isobaric ions were annotated</span>
        </p>
        <p class="max-w-measure-1">
          Check the <b>Molecules</b> panel to see candidate molecules from the isobaric {{ isobars.length == 1 ? 'ion' : 'ions' }},
          and the <b>Diagnostics</b> panel to compare the isotopic images and spectra.
        </p>
      </div>
    </div>
    <slot slot="reference" />
  </el-popover>
</template>

<script>
import config from '../../../lib/config'

export default {
  inheritAttrs: false,
  props: {
    possibleCompounds: { type: Array, required: true },
    limit: Number,
    isomers: Array,
    isobars: Array,
  },
  computed: {
    filteredCompounds() {
      return this.limit != null
        ? this.possibleCompounds.slice(0, this.limit)
        : this.possibleCompounds
    },
    moreCount() {
      return this.possibleCompounds.length - this.filteredCompounds.length
    },
    showIsomers() {
      return config.features.isomers && this.isomers && this.isomers.length > 0
    },
    showIsobars() {
      return config.features.isobars && this.isobars && this.isobars.some(isobar => isobar.shouldWarn)
    },
  },
  mounted() {
    const { popover } = this.$refs
    // WORKAROUND: popover doesn't have a "closeDelay" prop yet, so replace its event listeners with patched versions
    // TODO: Replace this with `:close-delay="0"` once https://github.com/ElemeFE/element/pull/16671 is available
    if (popover != null) {
      const patchedHandleMouseLeave = function() {
        clearTimeout(this._timer)
        this.showPopper = false
      }.bind(popover)

      if (popover.referenceElm != null) {
        popover.referenceElm.removeEventListener('mouseleave', popover.handleMouseLeave)
        popover.referenceElm.addEventListener('mouseleave', patchedHandleMouseLeave)
      }
      if (popover.popper != null) {
        popover.popper.removeEventListener('mouseleave', popover.handleMouseLeave)
        popover.popper.addEventListener('mouseleave', patchedHandleMouseLeave)
      }
    }
  },
}
</script>

<style lang="scss" scoped>
  .content * {
    margin: 0;
  }
  .content > * + * {
    @apply mt-4;
  }
  .content > .title + * {
    @apply mt-2;
  }
  .title + * {
    @apply mt-1;
  }
  .title {
    @apply font-bold;
  }
</style>
