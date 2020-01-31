<template>
  <div :class="cssClass">
    {{ Math.round(fdrLevel*100) }}% FDR
  </div>
</template>
<script>
export default {
  props: {
    fdrLevel: { type: Number, required: true },
  },
  computed: {
    cssClass() {
      if (this.fdrLevel <= 0.05) {
        return 'fdr-badge fdr-badge-5'
      } else if (this.fdrLevel <= 0.10) {
        return 'fdr-badge fdr-badge-10'
      } else if (this.fdrLevel <= 0.20) {
        return 'fdr-badge fdr-badge-20'
      } else {
        return 'fdr-badge fdr-badge-50'
      }
    },
  },
}
</script>
<style lang="scss" scoped>
  .fdr-badge {
    border-radius: 5px;
    padding: 2px 5px;
    margin: auto 10px;
    white-space: nowrap;

    &.fdr-badge-5 {
      background-color: #c8ffc8;
    }

    &.fdr-badge-10 {
      background-color: #e0ffe0;
    }

    &.fdr-badge-20 {
      background-color: #ffe;
    }

    &.fdr-badge-50 {
      background-color: #fff5e0;
    }
  }
</style>
