<template>
  <div class="peak-chart">
    <div ref="peakChart" style="height: 300px;">
    </div>
    <div class="plot-legend" v-if="legendItems">
      <div v-for="(item, idx) in legendItems" :key="idx" class='legend-item' >
        <svg width="64" height="32">
          <g>
            <g v-if="item.type === 'sample'" class="sample-graph" :class="item.cssClass">
              <g><circle cx="32" cy="4" r="4"/></g>
              <g><line x1="32" x2="32" y1="4" y2="32" /></g>
              <g><rect width="48" height="28" x="8" y="4" /></g>
            </g>
            <g v-else-if="item.type === 'theor'" class="theor-graph" :class="item.cssClass">
              <g><path :d="legendTheorLine"/></g>
            </g>
          </g>
        </svg>
        <span class="legend-item-name" v-html="item.name"></span>
      </div>
    </div>
  </div>
</template>

<script>
 import * as d3 from 'd3';

 class SampleGraph {
   constructor(svg, xScale, yScale, points, cssClass, ppm) {
     this.xScale = xScale;
     this.yScale = yScale;
     this.ppm = ppm;
     const element = svg.append('g').attr('class', `sample-graph ${cssClass}`);
     this.circles = element.append('g').selectAll('circle')
                       .data(points).enter().append('circle');

     this.lines = element.append('g').selectAll('line')
                      .data(points).enter().append('line');

     this.ppmRectangles = element.append('g').selectAll('rect')
                              .data(points).enter()
                              .append('rect');

     this.update();
   }

   update(t = null) {
     const circles = t ? this.circles.transition(t) : this.circles;
     const lines = t ? this.lines.transition(t) : this.lines;
     const ppmRectangles = t ? this.ppmRectangles.transition(t) : this.ppmRectangles;

     const circleRad = 4;
     const ppmRadius = 1e-6 * this.ppm;
     const ppmWidth = d => this.xScale(d[0] * (1 + ppmRadius)) - this.xScale(d[0] * (1 - ppmRadius));
     const ppmHeight = d => this.yScale(0) - this.yScale(d[1]);
     circles.attr('cx', d => this.xScale(d[0]))
            .attr('cy', d => this.yScale(d[1]))
            .attr('r', circleRad)
            .style('display', d => Math.min(ppmWidth(d), ppmHeight(d)) > circleRad ? 'none' : '');

     lines.attr('x1', d => this.xScale(d[0])).attr('x2', d => this.xScale(d[0]))
          .attr('y1', d => this.yScale(d[1])).attr('y2', d => this.yScale(0));

     ppmRectangles.attr('width', ppmWidth)
                  .attr('height', ppmHeight)
                  .attr('x', d => this.xScale(d[0] * (1 - ppmRadius)))
                  .attr('y', d => this.yScale(d[1]));
   }
 }

 class TheorGraph {
   constructor(svg, xScale, yScale, points, cssClass) {
     this.xScale = xScale;
     this.yScale = yScale;
     this.points = points;
     const element = svg.append('g').attr('class', `theor-graph ${cssClass}`);
     this.theorGraph = element.append('g').append('path');

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

   // Mask for "striped" effect on comparison ppm rectangles
   container.append('defs').html(`
      <pattern id="pattern-stripe"
               width="6" height="6"
               patternUnits="userSpaceOnUse"
               patternTransform="rotate(45)">
        <rect width="3" height="6" transform="translate(0,0)" fill="white"></rect>
      </pattern>
      <mask id="mask-stripe">
        <rect x="0" y="0" width="100%" height="100%" fill="url(#pattern-stripe)" />
      </mask>
  `);

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
   const sampleGraphs = pointss.map((points, i) => new SampleGraph(svg, xScale, yScale, points, sampleClasses[i], ppm));
   const theorGraphs = theorPointss.map((theorPoints, i) => new TheorGraph(svg, xScale, yScale, theorPoints, theorClasses[i]));

   // Overlay
   let brush = d3.brushX().extent([[0, 0], [width, height]]).on('end', brushHandler);
   let brushLayer = svg.append('g').call(brush);

   function update(t = null) {
     sampleGraphs.forEach(sampleGraph => sampleGraph.update(t));
     theorGraphs.forEach(theorGraph => theorGraph.update(t));
   }

   update();
 }

 export default {
   name: 'isotope-pattern-plot',
   props: ['data', 'legendItems'],
   watch: {
     'data': function(d) {
       this.redraw();
     }
   },
   data() {
     return {
       legendTheorLine: 'M0,31 L2,31 L4,31 L6,31 L8,31 L10,31 L12,31 L14,31 L16,31 L18,31 L20,30 L22,29 L24,26 L26,22 L28,16 L30,10 L32,4 L34,1 L36,2 L38,7 L40,13 L42,19 L44,25 L46,28 L48,30 L50,30 L52,31 L54,31 L56,31 L58,31 L60,31 L62,31'
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
<style lang="scss" scoped>
  .peak-chart /deep/ .sample-graph {
    circle {
      stroke: none;
    }

    line {
      stroke-width: 2;
    }

    rect {
    }
  }

  .peak-chart /deep/ .theor-graph {
    path {
      stroke-width: 2;
      fill: none;
    }
  }

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
