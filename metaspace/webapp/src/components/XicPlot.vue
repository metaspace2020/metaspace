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
   if (!element || element.clientHeight == 0) {
     return;
   }
   // IE 11
   if (window.navigator.userAgent.includes("Trident"))
     return;

   d3.select(element).select('svg').remove();

   const margin = {top: 20, right: 40, bottom: 40, left: 50},
         width = element.clientWidth - margin.left - margin.right,
         height = element.clientHeight - margin.top - margin.bottom,
         originTranslation = {x: 20, y: -5},
         [minRt, maxRt] = d3.extent(timeSeq),
         xDomain = [Math.max(0, minRt - 1), maxRt],
         yDomain = [0, Math.max.apply(null, intensities[0])];

   let xScale = d3.scaleLinear().domain(xDomain).range([0, width - originTranslation.x]);
   let yScale = d3.scaleLinear().domain(yDomain).range([height, originTranslation.y]);

   let xAxis = d3.axisBottom(xScale).ticks(5);
   let yAxis = d3.axisLeft(yScale).ticks(5).tickPadding(5).tickFormat(d3.format('.1e'));

   let plotPoints = d3.zip(timeSeq, intensities[0]);

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
       const xDomainInterval = s.map((n) => n - originTranslation.x)
                                .map(xScale.invert, xScale);

       function calcMaxIntensity(pts) {
         const intensities = pts.filter(d => d[0] >= xDomainInterval[0] && d[0] <= xDomainInterval[1])
                                .map(d => d[1]);
         return (intensities.length > 0) ? d3.max(intensities) : 0;
       }

       const intensityRange = [0, calcMaxIntensity(plotPoints)];
       xScale.domain(xDomainInterval);
       yScale.domain(intensityRange);
       brushLayer.call(brush.move, null); // remove the selection
     }

     const t = svg.transition().duration(300);
     gX.transition(t).call(xAxis);
     gY.transition(t).call(yAxis);

     update(t);
   }

   let container = d3.select(element).append('svg')
                     .attr('width', element.clientWidth)
                     .attr('height', element.clientHeight);

   let svg = container.append('g')
                      .attr('transform',
                            `translate(${margin.left}, ${margin.top})`);

   svg.append('defs')
        .append('clipPath')
          .attr('id', 'plot-clip')
        .append('rect')
          .attr('x', originTranslation.x)
          .attr('y', 2 * originTranslation.y)
          .attr('width', width - originTranslation.x)
          .attr('height', height - originTranslation.y);

   let gX = svg.append('g')
               .attr('transform', `translate(${originTranslation.x}, ${height + originTranslation.y})`)
               .call(xAxis);

   let gY = svg.append('g')
               .attr('transform', `translate(${originTranslation.x}, ${originTranslation.y})`)
               .call(yAxis);

   let graph = svg.append('g')
                    .attr('clip-path', 'url(#plot-clip)')
                  .append('path')
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

   let brush = d3.brushX()
                 .extent([[originTranslation.x, 2 * originTranslation.y], [width, height + originTranslation.y]])
                 .on('end', brushHandler);
   let brushLayer = svg.append('g').call(brush);

   function update(t) {
     let gr = graph;
     if (t) {
       gr = graph.transition(t);
     }

     const drawPath = d3.line().x(d => xScale(d[0]))
                               .y(d => yScale(d[1]));

     gr.attr('d', drawPath(plotPoints))
       .attr('transform', `translate(${originTranslation.x}, ${originTranslation.y})`);
   }

   update();
 }

 export default {
   name: 'xic-plot',
   props: ['intensityImgs', 'acquisitionGeometry'],
   watch: {
     'intensityImgs': function () { this.plot(); }
   },
   mounted() {
     this.plot();
     if (window) {
       window.addEventListener('resize', () => this.plot());
     }
   },
   methods: {
     plot() {
       if (this.intensityImgs && this.acquisitionGeometry && this.$refs.xicChart.clientHeight) {
         const timeSeq = this.acquisitionGeometry.acquisition_grid.coord_list.map((pixel) => pixel[0]);
         const timeUnitName = this.acquisitionGeometry.length_unit;

         Promise.all(this.intensityImgs.map((intImg => imageToIntensity(intImg.url, intImg.maxIntensity))))
         .then((intensities) => {
           plotChart(intensities, timeSeq, timeUnitName, this.$refs.xicChart);
         }).catch((e) => {
           console.log(e);
         });
       }
     }
   }
 }

</script>
