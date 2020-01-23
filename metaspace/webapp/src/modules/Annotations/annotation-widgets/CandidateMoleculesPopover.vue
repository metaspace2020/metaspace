<template>
  <el-popover trigger="hover" ref="popover" v-bind="$attrs">
    <div>
      <span>Candidate molecules ({{ possibleCompounds.length }}):</span>
      <ul>
        <li v-for="comp in filteredCompounds">
          {{ comp.name }}
        </li>
        <li class="more-count" v-if="moreCount">(+ {{moreCount}} more)</li>
      </ul>
      <div v-if="showIsomers" class="warning-section">
        <div class="warning-icon" />
        <p>
          <span v-if="isomers.length == 1">An isomeric ion was annotated.</span>
          <span v-else>{{isomers.length}} isomeric ions were annotated.</span>
          <br/>
          Check the <b>Molecules</b> panel for more candidates.
        </p>
      </div>
      <div v-if="showIsobars" class="warning-section">
        <div class="warning-icon" />
        <p>
          <span v-if="isobars.length == 1">An isobaric ion was annotated.</span>
          <span v-else>{{isobars.length}} isobaric ions were annotated.</span>
          <br/>
          Check the <b>Molecules</b> panel to see candidate molecules from the isobaric {{isobars.length == 1 ? 'ion' : 'ions'}},
          <br/>
          and the <b>Diagnostics</b> panel to compare the isotopic images and spectra.
        </p>
      </div>
    </div>

    <slot slot="reference" />
  </el-popover>
</template>

<script>
  import config from '../../../config';


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
          : this.possibleCompounds;
      },
      moreCount() {
        return this.possibleCompounds.length - this.filteredCompounds.length;
      },
      showIsomers() {
        return config.features.isomers && this.isomers && this.isomers.length > 0;
      },
      showIsobars() {
        return config.features.isobars && this.isobars && this.isobars.some(isobar => isobar.shouldWarn);
      }
    },
    mounted() {
      const {popover} = this.$refs;
      // WORKAROUND: popover doesn't have a "closeDelay" prop yet, so replace its event listeners with patched versions
      // TODO: Replace this with `:close-delay="0"` once https://github.com/ElemeFE/element/pull/16671 is available
      if (popover != null) {
        const patchedHandleMouseLeave = (function() {
          clearTimeout(this._timer);
          this.showPopper = false;
        }).bind(popover);

        if (popover.referenceElm != null) {
          popover.referenceElm.removeEventListener('mouseleave', popover.handleMouseLeave);
          popover.referenceElm.addEventListener('mouseleave', patchedHandleMouseLeave);
        }
        if (popover.popper != null) {
          popover.popper.removeEventListener('mouseleave', popover.handleMouseLeave);
          popover.popper.addEventListener('mouseleave', patchedHandleMouseLeave);
        }
      }
    }
  };
</script>

<style lang="scss" scoped>
  .more-count {
    list-style: none;
    font-style: italic;
  }
  .warning-section {
    display: flex;
  }
  .warning-icon {
    align-self: center;
    width: 16px;
    height: 16px;
    margin-right: 16px;

    background-image: url('../../../assets/danger.svg')
  }
</style>
