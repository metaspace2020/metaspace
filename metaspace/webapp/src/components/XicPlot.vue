<template>
  <div ref="xicChart" style="height: 300px;">
  </div>
</template>

<script>
 import * as d3 from 'd3';
 import {HOST_NAME, PORT} from '../../conf';

 function imageToIntensity(intensityImgUrl, maxIntensity) {
   return new Promise((resolve, reject) => {
     const xhr = new XMLHttpRequest();
     xhr.open("GET", `http://${HOST_NAME}${intensityImgUrl}`);
     xhr.overrideMimeType('application/octet-stream');
     xhr.responseType = 'arraybuffer';
     xhr.onload = () => {
       if (xhr.status == 200) {
         let pixelArray = new Uint8Array(xhr.response);
         let result = new Float32Array(pixelArray.length);
         for (let i = 0, pixCount = pixelArray.length; i < pixCount; ++i) {
           result[i] = maxIntensity * pixelArray[i] / 255;
         }
         resolve(result);
       } else {
         reject(xhr.statusText);
       }
     };
     xhr.onerror = () => reject(xhr.statusText);
     xhr.send();
   });
 }

 function plotChart(intensities, timeSeq, timeUnitName, element) {
   if (!element) {
     return;
   }
   // IE 11
   if (window.navigator.userAgent.includes("Trident"))
     return;

   d3.select(element).select('svg').remove();

   const margin = {top: 10, right: 5, bottom: 80, left: 40},
         width = element.clientWidth - margin.left - margin.right,
         height = element.clientHeight - margin.top - margin.bottom;
   const [minRt, maxRt] = d3.extent(timeSeq),
         xDomain = [Math.max(0, minRt - 1), maxRt + 1],
         yDomain = [0, Math.max.apply(null, intensities)];

   let xScale = d3.scaleLinear().range([0, width]).domain(xDomain);
   let yScale = d3.scaleLinear().range([height, 0]).domain(yDomain);

   let xAxis = d3.axisBottom(xScale).ticks(5);
   let yAxis = d3.axisLeft(yScale).ticks(5).tickPadding(5);

   let theorPoints = d3.zip(timeSeq, intensities);
   //console.log(intensities.filter((x) => x > 0));

   const dblClickTimeout = 400; // milliseconds
   let idleTimeout;

   function brushHandler() {
     const s = d3.event.selection;

     if (!s) { // click event
       if (!idleTimeout) // not double click => wait for the second click
         return idleTimeout = setTimeout(() => { idleTimeout = null; },
                                         dblClickTimeout);
       // double click => reset axes
       xScale.domain(xDomain);
       yScale.domain(yDomain);
     } else {
       const xRange = s.map(xScale.invert, xScale)

       function calcMaxIntensity(pts) {
         const intensities = pts
           .filter(d => d[0] >= xRange[0] && d[0] <= xRange[1])
           .map(d => d[1]);
         if (intensities.length > 0)
           return d3.max(intensities);
         return 0;
       }

       const intensityRange = [0, calcMaxIntensity(theorPoints)];
       xScale.domain(xRange);
       yScale.domain(intensityRange);
       brushLayer.call(brush.move, null); // remove the selection
     }

     const t = svg.transition().duration(300);
     gX.transition(t).call(xAxis);
     gY.transition(t).call(yAxis);

     update(t);
   }

   let container = d3.select(element).append('svg')
                     .attr('width', width + margin.left + margin.right)
                     .attr('height', height + margin.top + margin.bottom);

   let svg = container.append('g')
                      .attr('transform',
                            `translate(${margin.left}, ${margin.top})`);

   let gX = svg.append('g')
               .attr('transform', `translate(0, ${height})`)
               .call(xAxis);

   let gY = svg.append('g').call(yAxis);

   let theorGraph = svg.append('path')
                       .attr('class', 'line')
                       .attr('stroke', 'blue')
                       .attr('stroke-width', 1)
                       .attr('opacity', 0.6)
                       .attr('fill', 'none');

   svg.append('text')
      .text('Extracted ion intensity').style('text-anchor', 'middle')
      .attr('transform', `translate(-30, ${height/2}) rotate(-90)`);

   svg.append('text')
      .text(`Retention time [${timeUnitName}]`).style('text-anchor', 'middle')
      .attr('transform', `translate(${width / 2}, ${height +  30}) `);

   let brush = d3.brushX().extent([[0, 0], [width, height]]).on('end', brushHandler);
   let brushLayer = svg.append('g').call(brush);

   function update(t) {
     let gr = theorGraph;
     if (t) {
       gr = theorGraph.transition(t);
     }

     const drawPath =  d3.line()
                        .x(d => xScale(d[0]))
                        .y(d => yScale(d[1]));

     gr.attr('d', drawPath(theorPoints));
   }

   update();
 }

 export default {
   name: 'xic-plot',
   props: ['intensityImgUrl', 'maxAbsoluteIntensity', 'acquisitionGeometry'],
   watch: {
     'intensityImgUrl': function () { this.plot(); },
     'acquisitionGeometry': function () { this.plot(); }
   },
   mounted() {
     this.plot();
     if (window) {
       window.addEventListener('resize', () => this.plot());
     }
   },
   methods: {
     plot() {
       if (this.intensityImgUrl && this.acquisitionGeometry) {
         const timeSeq = this.acquisitionGeometry.acquisition_grid.coord_list.map((pixel) => pixel[0]);
         const timeUnitName = this.acquisitionGeometry.length_unit;

         imageToIntensity(this.intensityImgUrl, this.maxAbsoluteIntensity).then((intensities) => {
           plotChart(intensities, timeSeq, timeUnitName, this.$refs.xicChart);
         }).catch((e) => {
           console.log(e);
         });
       }
     }
   }
 }

</script>
