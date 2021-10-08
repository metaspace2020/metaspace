<template>
  <div
    class="el-button"
    :style="buttonStyle"
    @click="$emit('click')"
  >
    <div :style="progressStyle" />
    <div :style="textStyle">
      <slot />
    </div>
  </div>
</template>

<script lang="ts">

import Vue from 'vue'

export default Vue.extend({
  name: 'ProgressButton',
  props: {
    width: Number,
    height: Number,
    percentage: Number,
  },
  computed: {
    buttonStyle(): Object {
      return {
        width: this.width + 'px',
        height: this.height + 'px',
        padding: 0,
      }
    },
    textStyle(): Object {
      return Object.assign({
        'z-index': 2,
        position: 'absolute',
        display: 'flex',
        'flex-direction': 'column',
        'justify-content': 'center',
      }, this.buttonStyle)
    },
    progressStyle(): Object {
      return {
        'background-color': 'rgb(152, 255, 152)',
        width: ((this.width - 2) * this.percentage / 100.0) + 'px',
        height: (this.height - 2) + 'px',
        position: 'absolute',
        'z-index': 1,
      }
    },
  },
})
</script>
