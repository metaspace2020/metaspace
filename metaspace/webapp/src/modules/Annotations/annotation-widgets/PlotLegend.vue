<template>
  <div v-if="items" class="plot-legend">
    <div v-for="item in items" :key="item.name" class="legend-item">
      <hr class="legend-item-line" :style="'background-color:' + item.color + '; opacity:' + item.opacity" />
      <span class="legend-item-name" v-html="item.name" />
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'PlotLegend',
  props: {
    items: Array,
  },
})
</script>

<style></style>
