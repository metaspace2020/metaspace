<template>
  <el-popover trigger="hover" ref="popover" v-bind="$attrs">
    <div>Candidate molecules ({{ possibleCompounds.length }}):
      <ul>
        <li v-for="comp in possibleCompounds">
          {{ comp.name }}
        </li>
      </ul>
    </div>

    <slot slot="reference" />
  </el-popover>
</template>

<script>


  export default {
    inheritAttrs: false,
    props: {
      possibleCompounds: { type: Array, required: true }
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

<style scoped>

</style>
