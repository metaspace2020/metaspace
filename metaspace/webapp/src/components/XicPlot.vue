<template>
  <div ref="xicChart" style="height: 300px;">
    <canvas id="intensity-image" hidden>
    </canvas>
  </div>
</template>

<script>
 import * as d3 from 'd3';
 import {legendColor} from 'd3-svg-legend';
 import {HOST_NAME, PORT} from '../../conf';

 function imageToIntensity(intensityImgUrl, maxIntensity, canvasId) {
   return new Promise((resolve, reject) => {
     // IE 11
     if (window.navigator.userAgent.includes("Trident"))
       return;

     let intensityImage = new Image();
     intensityImage.onload = function() {
        const drawingContext = document.getElementById(canvasId).getContext('2d');
        drawingContext.drawImage(this, 0, 0, this.width, this.height);
        const imgData = drawingContext.getImageData(0, 0, this.width, this.height).data;

        let intensities = [];
        for (let i = 0; i < imgData.length; i += 4) {
            if (imgData[i] > 0) {
              console.log(imgData[i]);
            } else if (imgData[i + 1] > 0 || imgData[i + 2] > 0) {
              console.log(imgData.slice(i, i + 3));
            }
            intensities.push(maxIntensity * imgData[i] / 255);
        }
        resolve(intensities);
     }.bind(intensityImage);
     intensityImage.onerror = () => reject();
     intensityImage.crossOrigin = "Anonymous";
     intensityImage.src = `http://${HOST_NAME}${intensityImgUrl}`;
   });
 }

 async function plotChart(intensityImgUrl, maxAbsoluteIntensity, timeSeq, timeUnitName, element) {
   if (!element) {
     return;
   }

   let intensities = await imageToIntensity(intensityImgUrl, maxAbsoluteIntensity, 'intensity-image');

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
         plotChart(this.intensityImgUrl, this.maxAbsoluteIntensity, timeSeq, timeUnitName, this.$refs.xicChart);
       }
     }
   }
 }

</script>
