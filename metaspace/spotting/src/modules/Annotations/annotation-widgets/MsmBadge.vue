<template>
  <div :class="cssClass">
    MSM {{ msmScore.toFixed(3) }}
  </div>
</template>
<script>
export default {
  props: {
    msmScore: { type: Number, required: true },
  },
  computed: {
    cssClass() {
      if (this.msmScore >= 0.9) {
        return 'msm-badge msm-badge-900'
      } else if (this.msmScore >= 0.5) {
        return 'msm-badge msm-badge-500'
      } else if (this.msmScore >= 0.1) {
        return 'msm-badge msm-badge-100'
      } else {
        return 'msm-badge msm-badge-000'
      }
    },
  },
}
</script>
<style lang="scss" scoped>
  .msm-badge {
    border-radius: 5px;
    padding: 2px 5px;
    margin: auto 10px;
    white-space: nowrap;

    &.msm-badge-900 {
      background-color: #c8ffc8;
    }

    &.msm-badge-500 {
      background-color: #e0ffe0;
    }

    &.msm-badge-100 {
      background-color: #ffe;
    }

    &.msm-badge-000 {
      background-color: #fff5e0;
    }
  }
</style>
