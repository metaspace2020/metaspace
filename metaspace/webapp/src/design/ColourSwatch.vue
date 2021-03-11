<template>
  <div>
    <div
      class="h-10 rounded mb-2"
      :class="[{ 'opacity-bg': hasOpacity }, colourClass]"
    ></div>
    <p class="font-medium">
      {{ name }}
    </p>
    <p class="text-gray-700 text-xs leading-4 tracking-wide">
      {{ definition }}
    </p>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
export default Vue.extend({
  props: {
    colourClass: String,
    name: String,
    definition: String,
    hasOpacity: Boolean,
  },
})
</script>
<style scoped>
.opacity-bg {
  position: relative;
  overflow: hidden;
}
.opacity-bg::after {
  content: '';
  position: absolute;
  background-image: url('../assets/checkerboard.png');
  background-repeat: repeat;
  background-size: 12px;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: -1;
}
</style>
