<template>
  <div ref="peakChart">
  </div>
</template>

<script>
 import fetch from 'isomorphic-fetch';
 import Plotly from 'plotly.js/lib/core';

 function plotChart(data, element) {
   if (!element)
     return;
   const sampleData = data.sample;

   const plotData = [
     {
       name: 'Theoretical',
       x: data.theor.mzs,
       y: data.theor.ints,
       line: {color: 'blue'},
       opacity: 0.3,
       type: 'scatter',
       mode: 'lines'
     },
     {
       name: 'Sample',
       x: sampleData.mzs,
       y: sampleData.ints,
       type: 'scatter',
       mode: 'markers',
       line: {color: 'red'}
     }
   ];

   let shapes = [];
   for (let i = 0; i < sampleData['mzs'].length; i++) {
     shapes.push({
       type: 'line',
       x0: sampleData['mzs'][i],
       y0: 0,
       x1: sampleData['mzs'][i],
       y1: sampleData['ints'][i],
       line: {
         color: 'red',
         width: 2
       }
     });

     shapes.push({
       type: 'rect',
       xref: 'x',
       yref: 'paper',
       x0: sampleData['mzs'][i] * (1.0 - 1e-6 * data.ppm),
       y0: 0,
       x1: sampleData['mzs'][i] * (1.0 + 1e-6 * data.ppm),
       y1: 1,
       line: {width: 0},
       fillcolor: 'grey',
       opacity: 0.1
     });
   }

   const {minMz, maxMz} = data.mz_grid;
   var layout = {
     xaxis: {'range': [minMz, maxMz]},
     yaxis: {title: 'Intensity', rangemode: 'nonnegative'},
     legend: {x: 0.5, y: -0.2, xanchor: 'center', yanchor: 'top',
              orientation: 'h', traceorder: 'reversed'},
     margin: {t: 20, b: 20},
     font: {size: 16},
     shapes,
     paper_bgcolor: 'rgba(0,0,0,0)',
     plot_bgcolor: 'rgba(0,0,0,0)'
   };

   Plotly.newPlot(element, plotData, layout);
   window.onresize = () => Plotly.Plots.resize(element);
 }

 export default {
   name: 'isotope-pattern-plot',
   props: ['data'],
   watch: {
     'data': function(d) {
       plotChart(d, this.$refs.peakChart);
     }
   },
   created() {
     plotChart(this.data, this.$refs.peakChart);
   }
 }

</script>
