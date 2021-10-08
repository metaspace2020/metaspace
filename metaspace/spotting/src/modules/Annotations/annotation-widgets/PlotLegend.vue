<template>
  <div
    v-if="items"
    class="plot-legend"
  >
    <div
      v-for="item in items"
      :key="item.name"
      class="legend-item"
    >
      <hr
        class="legend-item-line"
        :style=" 'background-color:' + item.color + '; opacity:' + item.opacity "
      >
      <span
        class="legend-item-name"
        v-html="item.name"
      />
    </div>
  </div>
</template>

<script>
export default {
  name: 'PlotLegend',
  props: ['items'],
}

</script>

<style>

</style>
