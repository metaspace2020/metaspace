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
      <div v-if="isomers && isomers.length > 0" class="isomer-warning">
        <div class="isomer-warning-icon" />
        <div>
          <span v-if="isomers.length == 1">An isomeric ion was also annotated.</span>
          <span v-else>{{isomers.length}} isomeric ions were also annotated.</span>
          <br/>
          <span> Check the <b>Molecules</b> panel for more candidates.</span>
        </div>
      </div>
    </div>

    <slot slot="reference" />
  </el-popover>
</template>

<script>


  export default {
    inheritAttrs: false,
    props: {
      possibleCompounds: { type: Array, required: true },
      limit: Number,
      isomers: Array,
    },
    computed: {
      filteredCompounds() {
        return this.limit != null
          ? this.possibleCompounds.slice(0, this.limit)
          : this.possibleCompounds;
      },
      moreCount() {
        return this.possibleCompounds.length - this.filteredCompounds.length;
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
  .isomer-warning {
    display: flex;
  }
  .isomer-warning-icon {
    align-self: center;
    width: 16px;
    height: 16px;
    margin-right: 16px;

    background-image: url('../../../assets/danger.svg')
  }
</style>
