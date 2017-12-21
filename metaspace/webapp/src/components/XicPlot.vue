<template>
  <div ref="xicChart" style="height: 300px;">
  </div>
</template>

<script>
 import * as d3 from 'd3';
 import {HOST_NAME, PORT} from '../../conf';

 function imageToIntensity(intensityImgUrl, maxIntensity) {
   const requestParams = {
     method: 'GET',
     cache: 'force-cache'
   };

   return fetch(intensityImgUrl, requestParams).then(response => {
     if (!response.ok) {
       throw response.statusText;
     } else {
       return response.arrayBuffer();
     }
   }).then(buf => {
     let pixelArray = new Uint8Array(buf);
     let result = new Float32Array(pixelArray.length);
     for (let i = 0, pixCount = pixelArray.length; i < pixCount; ++i) {
       result[i] = maxIntensity * pixelArray[i] / 255;
     }
     return result;
   });
 }

 function plotChart(intensities, timeSeq, timeUnitName, logIntensity, isotopeColors, element) {
   if (!element || element.clientHeight == 0) {
     return;
   }
   // IE 11
   if (window.navigator.userAgent.includes("Trident")) {
     console.log('D3.js is incompatible with IE11. Failed to render XIC plot.');
     return;
   }

   if (intensities.length > isotopeColors.length) {
     console.log(`Mismatch between number of XIC plots (${intensities.length}) and their colors (${isotopeColors.length}).`
                  + ' Failed to render XIC plot.');
     return;
   }

   d3.select(element).select('svg').remove();

   const margin = {top: 20, right: 40, bottom: 40, left: 50},
         width = element.clientWidth - margin.left - margin.right,
         height = element.clientHeight - margin.top - margin.bottom,
         originTranslation = {x: 20, y: -5},
         [minRt, maxRt] = d3.extent(timeSeq),
         maxIntensity = d3.max(intensities.map(arr => d3.max(arr))),
         minIntensity = logIntensity ? d3.min(intensities.map(arr => d3.min(arr))) : 0,
         xDomain = [d3.max([0, minRt - 1]), maxRt],
         yDomain = [minIntensity, maxIntensity];

   let xScale = d3.scaleLinear().domain(xDomain).range([0, width - originTranslation.x]);
   let yScale = logIntensity ? d3.scaleLog().base(10) : d3.scaleLinear();
   yScale = yScale.domain(yDomain).range([height, originTranslation.y]);

   let xAxis = d3.axisBottom(xScale).ticks(5);
   let yAxis = d3.axisLeft(yScale).ticks(5, '.1e').tickPadding(5);

   let plotPoints = intensities.map(arr => d3.zip(timeSeq, arr));

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

       const intensityRange = [minIntensity, d3.max(plotPoints.map(arr => calcMaxIntensity(arr)))];
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

   let gGraph = svg.append('g')
                    .attr('clip-path', 'url(#plot-clip)');
   let graphs = [];
   for (let i = 0; i < intensities.length; ++i) {
     graphs.push(gGraph.append('path')
            .attr('class', 'line')
            .attr('stroke', isotopeColors[i])
            .attr('stroke-width', 2)
            .attr('opacity', 1)
            .attr('fill', 'none'));
   }

   svg.append('text')
      .text(`Ion intensity${logIntensity ? ' (log)': ''}`).style('text-anchor', 'middle')
      .attr('transform', `translate(-30, ${height/2}) rotate(-90)`);

   svg.append('text')
      .text(`Retention time [${timeUnitName}]`).style('text-anchor', 'middle')
      .attr('transform', `translate(${width / 2}, ${height +  30}) `);

   let brush = d3.brushX()
                 .extent([[originTranslation.x, 2 * originTranslation.y], [width, height + originTranslation.y]])
                 .on('end', brushHandler);
   let brushLayer = svg.append('g').call(brush);

   function update(t) {
     let gs = graphs;
     if (t) {
       gs = graphs.map(g => g.transition(t));
     }

     const drawPath = d3.line().x(d => xScale(d[0]))
                               .y(d => yScale(d[1]));

     plotPoints.forEach((points, graphIdx) => {
       gs[graphIdx].attr('d', drawPath(points))
         .attr('transform', `translate(${originTranslation.x}, ${originTranslation.y})`);
     });
   }

   update();
 }

 export default {
   name: 'xic-plot',
   props: ['intensityImgs', 'isotopeColors', 'acquisitionGeometry', 'logIntensity'],
   watch: {
     'intensityImgs': function () { this.reloadPlot(); },
     'acquisitionGeometry': function () { this.reloadPlot(); },
     'logIntensity': function() {
       if (this.currentIntensities) {
         this.updatePlot();
       } else {
         this.reloadPlot();
       }
     }
   },
   data() {
     return {
       validIntImages: [],
       currentIntensities: []
     }
   },
   mounted() {
     this.reloadPlot();
     if (window) {
       window.addEventListener('resize', () => this.reloadPlot());
     }
   },
   methods: {
     reloadPlot() {
       this.validIntImages = this.intensityImgs.filter(intImg => intImg.url);
       if (this.validIntImages && this.acquisitionGeometry && this.$refs.xicChart && this.$refs.xicChart.clientHeight) {
         Promise.all(this.validIntImages.map((intImg => imageToIntensity(intImg.url, intImg.maxIntensity))))
         .then((intensities) => {
           this.currentIntensities = intensities;
           this.updatePlot();
         }).catch((e) => {
           console.log(e);
         });
       }
     },
     updatePlot() {
       if (!this.currentIntensities) {
         throw 'XIC data not loaded';
       }
       const timeSeq = this.acquisitionGeometry.acquisition_grid.coord_list.map((pixel) => pixel[0]);
       const timeUnitName = this.acquisitionGeometry.length_unit;
       const lowerLogIntThreshold = this.validIntImages[0].maxIntensity * 0.01;
       const intensitiesToPlot = this.logIntensity
                                 ? this.currentIntensities
                                   .map(arr => arr.map(i => i < lowerLogIntThreshold ? lowerLogIntThreshold : i))
                                 : this.currentIntensities;
       plotChart(intensitiesToPlot, timeSeq, timeUnitName, this.logIntensity, this.isotopeColors, this.$refs.xicChart);
     }
   }
 }

</script>
