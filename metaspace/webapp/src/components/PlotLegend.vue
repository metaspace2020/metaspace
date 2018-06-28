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

.plot-legend {
  display: flex;
  justify-content: center;
}

.legend-item {
  margin: 5px 30px;
}

.legend-item-line {
  display: block;
  border: 0;
  height: 2px;
  width: 30px;
}

.legend-item-name {
  text-align: center;
  display: block;
}

</style>
