<template>
  <div class="plot-legend" v-if="items">
    <div v-for="(item, idx) in items" :key="item.name" class='legend-item' >
      <hr class="legend-item-line" :style=" 'background-color:' + item.color + '; opacity:' + item.opacity "/>
      <span class="legend-item-name" v-html="item.name"></span>
    </div>
  </div>
</template>

<script>
 export default {
   name: 'plot-legend',
   props: ['items']
 }

</script>

<style>


</style>
