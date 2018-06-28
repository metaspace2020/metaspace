<template>
  <div ref="peakChart" style="height: 300px;">
  </div>
</template>

<script>
 import * as d3 from 'd3';

 function plotChart(data, isotopeColors, theorColor, element) {
   if (!element) return;
   if (!data) return;

   let {sampleData} = data;
   const maxIntensity = sampleData.ints.reduce((a, b) => Math.max(a, b));
   sampleData.ints = sampleData.ints.map(i => i / maxIntensity * 100.0);

   const ppm = data.ppm;

   d3.select(element).select('svg').remove();

   const margin = {top: 10, right: 40, bottom: 50, left: 40},
         width = element.clientWidth - margin.left - margin.right,
         height = element.clientHeight - margin.top - margin.bottom;
   const [minMz, maxMz] = d3.extent(sampleData['mzs']),
         xDomain = [minMz - 0.1, maxMz + 0.1],
         yDomain = [0, 100];
   let xScale = d3.scaleLinear().range([0, width]).domain(xDomain);
   let yScale = d3.scaleLinear().range([height, 0]).domain(yDomain);

   let xAxis = d3.axisBottom(xScale).ticks(5);
   let yAxis = d3.axisLeft(yScale).ticks(5).tickPadding(5);

   let points = d3.zip(sampleData['mzs'], sampleData['ints']);
   let theorPoints = d3.zip(data.theor.mzs, data.theor.ints);

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
       const mzRange = s.map(xScale.invert, xScale)

       function calcMaxIntensity(pts) {
         const intensities = pts
           .filter(d => d[0] >= mzRange[0] && d[0] <= mzRange[1])
           .map(d => d[1]);
         if (intensities.length > 0)
           return d3.max(intensities);
         return 0;
       }

       const intensityRange = [0, d3.max([calcMaxIntensity(points),
                                          calcMaxIntensity(theorPoints)])];
       xScale.domain(mzRange);
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

   let circles = svg.selectAll('circle')
                    .data(points).enter()
                    .append('circle')
                    .attr('r', 4)
                    .style('fill', (d, i) => isotopeColors[i]);

   let lines = svg.append('g').selectAll('line')
                  .data(points).enter().append('line')
                  .attr('stroke', (d, i) => isotopeColors[i])
                  .attr('stroke-width', 3);

   let ppmRectangles = svg.append('g').selectAll('rect')
                          .data(points).enter()
                          .append('rect')
                          .attr('opacity', 0.2)
                          .attr('fill', 'grey')
                          .attr('height', yScale(0))
                          .attr('y', 0);

   let theorGraph = svg.append('path')
                       .attr('class', 'line')
                       .attr('stroke', theorColor)
                       .attr('stroke-width', 2)
                       .attr('opacity', 0.6)
                       .attr('fill', 'none');

   svg.append('text')
      .text('Intensity').style('text-anchor', 'middle')
      .attr('transform', `translate(-30, ${height/2}) rotate(-90)`);

   svg.append('text')
      .text('m/z').style('text-anchor', 'middle')
      .attr('transform', `translate(${width / 2}, ${height +  30}) `);

   let brush = d3.brushX().extent([[0, 0], [width, height]]).on('end', brushHandler);
   let brushLayer = svg.append('g').call(brush);

   function update(t) {
     let r = ppmRectangles, c = circles, l = lines, gr = theorGraph;
     if (t) {
       r = r.transition(t);
       c = c.transition(t);
       l = l.transition(t);
       gr = theorGraph.transition(t);
     }

     r.attr('width',
            d => xScale(d[0] * (1 + 1e-6 * ppm)) - xScale(d[0] * (1 - 1e-6 * ppm)))
      .attr('x', d => xScale(d[0] * (1 - 1e-6 * ppm)));

     c.attr('cx', d => xScale(d[0]))
      .attr('cy', d => yScale(d[1]));

     l.attr('x1', d => xScale(d[0])).attr('x2', d => xScale(d[0]))
      .attr('y1', d => yScale(d[1])).attr('y2', d => yScale(0));

     const drawPath =  d3.line().x(d => xScale(d[0])).y(d => yScale(d[1]));
     gr.attr('d', drawPath(theorPoints));
   }

   update();
 }

 export default {
   name: 'isotope-pattern-plot',
   props: ['data', 'isotopeColors', 'theorColor'],
   watch: {
     'data': function(d) {
       if (d) this.plot(d);
     }
   },
   mounted() {
     if (this.data)
       this.plot(this.data);

     if (window)
       window.addEventListener('resize', () => this.plot(this.data));
   },
   methods: {
     plot(data) {
       plotChart(data, this.isotopeColors, this.theorColor, this.$refs.peakChart);
     }
   }
 }

</script>
