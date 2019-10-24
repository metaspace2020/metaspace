<template>
  <div ref="peakChart" style="height: 300px;">
  </div>
</template>

<script>
 import * as d3 from 'd3';

 class MeasuredPeaks {
   constructor(svg, xScale, yScale, points, cssClass, ppm) {
     this.xScale = xScale;
     this.yScale = yScale;
     this.ppm = ppm;
     this.circles = svg.append('g').selectAll('circle')
                       .data(points).enter().append('circle')
                        .attr('r', 4)
                        .style('cssClass', cssClass);

     this.lines = svg.append('g').selectAll('line')
                      .data(points).enter().append('line')
                      .attr('cssClass', cssClass)
                      .attr('stroke-width', 3);

     this.ppmRectangles = svg.append('g').selectAll('rect')
                              .data(points).enter()
                              .append('rect')
                              .attr('opacity', 0.2)
                              .attr('cssClass', cssClass)
                              .attr('height', yScale(0))
                              .attr('y', 0);

     this.update();
   }

   update(t = null) {
     const circles = t ? this.circles.transition(t) : this.circles;
     const lines = t ? this.lines.transition(t) : this.lines;
     const ppmRectangles = t ? this.ppmRectangles.transition(t) : this.ppmRectangles;

     ppmRectangles.attr('width', d => this.xScale(d[0] * (1 + 1e-6 * this.ppm))
                                      - this.xScale(d[0] * (1 - 1e-6 * this.ppm)))
                   .attr('x', d => this.xScale(d[0] * (1 - 1e-6 * this.ppm)));

     circles.attr('cx', d => this.xScale(d[0]))
             .attr('cy', d => this.yScale(d[1]));

     lines.attr('x1', d => this.xScale(d[0])).attr('x2', d => this.xScale(d[0]))
           .attr('y1', d => this.yScale(d[1])).attr('y2', d => this.yScale(0));
   }
 }

 class TheorGraph {
   constructor(svg, xScale, yScale, points, color) {
     this.xScale = xScale;
     this.yScale = yScale;
     this.points = points;
     this.color = color;
     this.theorGraph = svg.append('g').append('path')
                             .attr('class', 'line')
                             .attr('stroke', color)
                             .attr('stroke-width', 2)
                             .attr('opacity', 0.6)
                             .attr('fill', 'none');

     this.update();
   }

   update(t = null) {
     const theorGraph = t ? this.theorGraph.transition(t) : this.theorGraph;

     const drawPath = d3.line().x(d => this.xScale(d[0])).y(d => this.yScale(d[1]));
     theorGraph.attr('d', drawPath(this.points));
   }
 }

 function plotChart(data, element) {
   if (!element) return;
   if (!data) return;

   const {sampleDatas, ppm, theors, sampleClasses, theorClasses} = data;
   const maxIntensity = Math.max(...sampleDatas.map(sampleData => Math.max(...sampleData.ints)));
   const sampleIntss = sampleDatas.map(sampleData => sampleData.ints.map(i => i / maxIntensity * 100.0));
   const sampleMzs = sampleDatas.map(sampleData => sampleData.mzs);

   d3.select(element).select('svg').remove();

   const margin = {top: 10, right: 40, bottom: 50, left: 40};
   const width = element.clientWidth - margin.left - margin.right;
   const height = element.clientHeight - margin.top - margin.bottom;
   const [minMz, maxMz] = d3.extent([].concat(...sampleMzs));

   const xDomain = [minMz - 0.1, maxMz + 0.1];
   const yDomain = [0, 100];
   const xScale = d3.scaleLinear().range([0, width]).domain(xDomain);
   const yScale = d3.scaleLinear().range([height, 0]).domain(yDomain);

   const xAxis = d3.axisBottom(xScale).ticks(5);
   const yAxis = d3.axisLeft(yScale).ticks(5).tickPadding(5);

   const pointss = sampleIntss.map((sampleInts, i) => d3.zip(sampleMzs[i], sampleInts));
   const theorPointss = theors.map(({mzs, ints}) => d3.zip(mzs, ints));

   const dblClickTimeout = 400; // milliseconds
   let idleTimeout;

   function brushHandler() {
     const s = d3.event.selection;

     if (!s) { // click event
       if (!idleTimeout) // not double click => wait for the second click
         return idleTimeout = setTimeout(() => { idleTimeout = null; }, dblClickTimeout);
       // double click => reset axes
       xScale.domain(xDomain);
       yScale.domain(yDomain);
     } else {
       const mzRange = s.map(xScale.invert, xScale);

       function calcMaxIntensity(pts) {
         if (pts) {
           const intensities = pts
             .filter(d => d[0] >= mzRange[0] && d[0] <= mzRange[1])
             .map(d => d[1]);
           if (intensities.length > 0)
             return d3.max(intensities);
         }
         return 0;
       }

       const intensityRange = [0, d3.max([
         ...pointss.map(calcMaxIntensity),
         ...theorPointss.map(calcMaxIntensity),
       ])];
       xScale.domain(mzRange);
       yScale.domain(intensityRange);
       brushLayer.call(brush.move, null); // remove the selection
     }

     const t = svg.transition().duration(300);
     gX.transition(t).call(xAxis);
     gY.transition(t).call(yAxis);

     update(t);
   }

   // Chart outer
   const container = d3.select(element).append('svg')
                     .attr('width', width + margin.left + margin.right)
                     .attr('height', height + margin.top + margin.bottom);

   const svg = container.append('g')
                      .attr('transform',
                            `translate(${margin.left}, ${margin.top})`);

   const gX = svg.append('g')
               .attr('transform', `translate(0, ${height})`)
               .call(xAxis);

   const gY = svg.append('g').call(yAxis);

   svg.append('text')
      .text('Intensity').style('text-anchor', 'middle')
      .attr('transform', `translate(-30, ${height/2}) rotate(-90)`);

   svg.append('text')
      .text('m/z').style('text-anchor', 'middle')
      .attr('transform', `translate(${width / 2}, ${height +  30}) `);

   // Data
   const measuredPeakss = pointss.map((points, i) => new MeasuredPeaks(svg, xScale, yScale, points, sampleClasses[i], ppm));
   const theorGraphs = theorPointss.map((theorPoints, i) => new TheorGraph(svg, xScale, yScale, theorPoints, theorClasses[i]));

   // Overlay
   let brush = d3.brushX().extent([[0, 0], [width, height]]).on('end', brushHandler);
   let brushLayer = svg.append('g').call(brush);

   function update(t = null) {
     measuredPeakss.forEach(measuredPeaks => measuredPeaks.update(t));
     theorGraphs.forEach(theorGraph => theorGraph.update(t));
   }

   update();
 }

 export default {
   name: 'isotope-pattern-plot',
   props: ['data'],
   watch: {
     'data': function(d) {
       this.redraw();
     }
   },
   mounted() {
       this.redraw();

     if (window)
       window.addEventListener('resize', () => this.redraw());
   },
   methods: {
     redraw() {
       plotChart(this.data, this.$refs.peakChart);
     }
   }
 }

</script>
