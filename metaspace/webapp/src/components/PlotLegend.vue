<template>
  <div ref="plotLegend" style="height: 40px;">
  </div>
</template>

<script>
 import * as d3 from 'd3';
 import {legendColor} from 'd3-svg-legend';

 function renderLegend(items, element) {
   if (!element || !items) {
       return;
   }

   d3.select(element).select('svg').remove();

   const margin = {top: 10, right: 40, bottom: 80, left: 40},
         width = element.clientWidth - margin.left - margin.right,
         height = element.clientHeight - margin.top - margin.bottom;

   let container = d3.select(element).append('svg')
                     .attr('width', width + margin.left + margin.right)
                     .attr('height', height + margin.top + margin.bottom);

    let legendItemWidth = 65;
    let legendItemPadding = 40;
    let legend = container.append('g')
        .attr('transform', `translate(${margin.left + width / 2
                                                    - legendItemWidth * items.length / 2
                                                    - legendItemPadding * (items.length - 1) / 2 },
                                        ${height + margin.top + 50})`);

    const types = d3.scaleOrdinal()
                    .domain(items.map(i => i['name']))
                    .range(items.map(i => i['color']));

    let drawLegend = legendColor()
        .orient('horizontal')
        .shape('line').shapeWidth(legendItemWidth).shapePadding(legendItemPadding).scale(types);
    legend.call(drawLegend);
 }

 export default {
   name: 'plot-legend',
   props: ['items'],
   watch: {
     'items': function(items) {
       if (items) {
           this.render(items);
       }
     }
   },
   mounted() {
     if (this.items) {
       this.render(this.items);
     }

     if (window) {
       window.addEventListener('resize', () => this.render(this.items));
     }
   },
   methods: {
     render(items) {
       renderLegend(items, this.$refs.plotLegend);
     }
   }
 }

</script>
