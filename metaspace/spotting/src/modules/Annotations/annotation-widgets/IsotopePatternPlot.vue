<template>
  <div class="peak-chart">
    <div
      ref="peakChart"
      style="height: 300px;"
    />
    <div
      v-if="legendItems"
      class="plot-legend"
    >
      <div
        v-for="(item, idx) in legendItems"
        :key="idx"
        class="legend-item"
      >
        <svg
          width="64"
          height="32"
        >
          <g>
            <g
              v-if="item.type === 'sample'"
              class="sample-graph"
              :class="item.cssClass"
            >
              <g><circle
                cx="32"
                cy="4"
                r="4"
              /></g>
              <g><line
                x1="32"
                x2="32"
                y1="4"
                y2="32"
              /></g>
              <g><rect
                width="48"
                height="28"
                x="8"
                y="4"
              /></g>
            </g>
            <g
              v-else-if="item.type === 'theor'"
              class="theor-graph"
              :class="item.cssClass"
            >
              <g><path :d="legendTheorLine" /></g>
            </g>
          </g>
        </svg>
        <span
          class="legend-item-name"
          v-html="item.labelHtml"
        />
      </div>
    </div>
  </div>
</template>

<script>
import * as d3 from 'd3'
import { range, throttle } from 'lodash-es'

class SampleGraph {
  constructor(svg, xScale, yScale, points, cssClass, ppm) {
    this.xScale = xScale
    this.yScale = yScale
    this.ppm = ppm
    const element = svg.append('g').attr('class', `sample-graph ${cssClass}`)
    this.circles = element.append('g').selectAll('circle')
      .data(points).enter().append('circle')

    this.lines = element.append('g').selectAll('line')
      .data(points).enter().append('line')

    this.ppmRectangles = element.append('g').selectAll('rect')
      .data(points).enter()
      .append('rect')

    this.update()
  }

  update(t = null) {
    const circles = t ? this.circles.transition(t) : this.circles
    const lines = t ? this.lines.transition(t) : this.lines
    const ppmRectangles = t ? this.ppmRectangles.transition(t) : this.ppmRectangles

    const circleRad = 4
    const ppmRadius = 1e-6 * this.ppm
    const ppmWidth = d => this.xScale(d[0] * (1 + ppmRadius)) - this.xScale(d[0] * (1 - ppmRadius))
    const ppmHeight = d => this.yScale(0) - this.yScale(d[1])
    circles.attr('cx', d => this.xScale(d[0]))
      .attr('cy', d => this.yScale(d[1]))
      .attr('r', circleRad)
      // Hide circle when ppmRectangle is visible?
      // circles.style('display', d => Math.min(ppmWidth(d), ppmHeight(d)) > circleRad ? 'none' : '');

    lines.attr('x1', d => this.xScale(d[0])).attr('x2', d => this.xScale(d[0]))
      .attr('y1', d => this.yScale(d[1])).attr('y2', d => this.yScale(0))

    ppmRectangles.attr('width', ppmWidth)
      .attr('height', ppmHeight)
      .attr('x', d => this.xScale(d[0] * (1 - ppmRadius)))
      .attr('y', d => this.yScale(d[1]))
  }
}

class TheorGraph {
  constructor(svg, xScale, yScale, points, cssClass) {
    this.xScale = xScale
    this.yScale = yScale
    this.points = points
    const element = svg.append('g').attr('class', `theor-graph ${cssClass}`)
    this.theorGraph = element.append('g').append('path')

    this.update()
  }

  update(t = null) {
    const theorGraph = t ? this.theorGraph.transition(t) : this.theorGraph

    const drawPath = d3.line().x(d => this.xScale(d[0])).y(d => this.yScale(d[1]))
    theorGraph.attr('d', drawPath(this.points))
  }
}

function plotChart(data, element, relativeIntensityScale, toggleRelativeIntensityScale) {
  if (!element) return
  if (!data) return

  const { sampleDatas, ppm, theors, sampleClasses, theorClasses } = data
  const sampleMzs = sampleDatas.map(sampleData => sampleData.mzs)
  const sampleInts = sampleDatas.map(sampleData => {
    if (relativeIntensityScale) {
      const maxIntensity = Math.max(...sampleData.ints)
      return sampleData.ints.map(i => i / maxIntensity * 100.0)
    } else {
      return sampleData.ints
    }
  })

  const margin = { top: 10, right: 40, bottom: 50, left: relativeIntensityScale ? 40 : 60 }
  const width = element.clientWidth - margin.left - margin.right
  const height = element.clientHeight - margin.top - margin.bottom
  const [minMz, maxMz] = d3.extent([].concat(...sampleMzs))
  const maxInts = sampleInts.map(ints => d3.max(ints))

  const xDomain = [minMz - 0.1, maxMz + 0.1]
  const yDomain = [0, relativeIntensityScale ? 100 : d3.max(maxInts)]
  const xScale = d3.scaleLinear().range([0, width]).domain(xDomain)
  const yScale = d3.scaleLinear().range([height, 0]).domain(yDomain)

  const xAxis = d3.axisBottom(xScale).ticks(5)
  const yAxis = d3.axisLeft(yScale).ticks(5, relativeIntensityScale ? null : 'e').tickPadding(5)

  const pointss = sampleInts.map((sampleInts, i) => d3.zip(sampleMzs[i], sampleInts))
  const theorPointss = theors.map(({ mzs, ints }, i) => {
    if (relativeIntensityScale) {
      return d3.zip(mzs, ints)
    } else {
      const scale = maxInts[i] / 100
      return d3.zip(mzs, ints.map(int => int * scale))
    }
  })

  const dblClickTimeout = 400 // milliseconds
  let idleTimeout

  function brushHandler() {
    const s = d3.event.selection

    if (!s) { // click event
      if (!idleTimeout) {
        // not double click => wait for the second click
        idleTimeout = setTimeout(() => { idleTimeout = null }, dblClickTimeout)
        return idleTimeout
      }
      // double click => reset axes
      xScale.domain(xDomain)
      yScale.domain(yDomain)
    } else {
      let mzRange = s.map(xScale.invert, xScale)
      // Workaround: Rendering when highly zoomed is very slow in comparison mode (probably due to the striped fill)
      // and can even crash/hang the browser. Prevent excessive zooming.
      if (mzRange[1] - mzRange[0] < 0.01) {
        const mid = (mzRange[0] + mzRange[1]) / 2
        mzRange = [mid - 0.005, mid + 0.005]
      }

      // eslint-disable-next-line no-inner-declarations
      function calcMaxIntensity(pts) {
        if (pts) {
          const intensities = pts
            .filter(d => d[0] >= mzRange[0] && d[0] <= mzRange[1])
            .map(d => d[1])
          if (intensities.length > 0) {
            return d3.max(intensities)
          } else {
            // no points in range - get the intensity of the closest point to the selected range
            return pts
              .map((d, i) => [Math.abs(d[0] - mzRange[0]), d[1]])
              .reduce((a, r) => a[0] < r[0] ? a : r, [Infinity, 100])[1]
          }
        }
        return 0
      }
      const maxInt = d3.max([
        ...pointss.map(calcMaxIntensity),
        ...theorPointss.map(calcMaxIntensity),
      ])
      const intensityRange = [0, maxInt !== 0 ? maxInt : 100]
      xScale.domain(mzRange)
      yScale.domain(intensityRange)
      brush.move(brushLayer, null) // remove the selection
    }

    const t = svg.transition().duration(300)
    xAxis(gX.transition(t))
    yAxis(gY.transition(t))

    update(t)
  }

  // Chart outer
  d3.select(element).select('svg').remove()
  const container = d3.select(element).append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)

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
   `)

  const svg = container.append('g')
    .attr('transform', `translate(${margin.left}, ${margin.top})`)

  const gX = svg.append('g')
    .attr('transform', `translate(0, ${height})`)
    .call(xAxis)

  const gY = svg.append('g').call(yAxis)

  svg.append('text')
    .text(relativeIntensityScale ? 'Relative intensity' : 'Intensity')
    .attr('class', 'intensity-axis-label')
    .attr('transform', `translate(-${relativeIntensityScale ? 30 : 50}, ${height / 2}) rotate(-90)`)
    .on('click', toggleRelativeIntensityScale)

  svg.append('text')
    .text('m/z').style('text-anchor', 'middle')
    .attr('transform', `translate(${width / 2}, ${height + 30}) `)

  // Data
  const sampleGraphs = pointss.map((points, i) => new SampleGraph(svg, xScale, yScale, points, sampleClasses[i], ppm))
  const theorGraphs = theorPointss.map((theorPoints, i) =>
    new TheorGraph(svg, xScale, yScale, theorPoints, theorClasses[i]))

  // Overlay
  const brush = d3.brushX().extent([[0, 0], [width, height]]).on('end', brushHandler)
  const brushLayer = svg.append('g').call(brush)

  function update(t = null) {
    sampleGraphs.forEach(sampleGraph => sampleGraph.update(t))
    theorGraphs.forEach(theorGraph => theorGraph.update(t))
  }

  update()
}

const makeLegendTheorLine = () => {
  const curve = [
    0, 0, 0, 0, 0, 1, 2, 4, 9, 16, 27, 42, 59, 77, 91, 100,
    100, 92, 77, 60, 42, 28, 16, 9, 5, 2, 1, 0, 0, 0, 0, 0,
  ]
  const drawPath = d3.line().x(d => d * 2).y(d => 31 - curve[d] * 0.3)
  return drawPath(range(32))
}

export default {
  name: 'IsotopePatternPlot',
  props: ['data', 'legendItems'],
  data() {
    return {
      legendTheorLine: makeLegendTheorLine(),
      relativeIntensityScale: true,
    }
  },
  watch: {
    data: function(d) {
      this.redraw()
    },
  },
  mounted() {
    this.redraw = throttle(this.redraw, 200)
    if (this.data) {
      this.redraw()
    }

    if (window) {
      window.addEventListener('resize', () => this.redraw())
    }
  },
  methods: {
    redraw() {
      plotChart(this.data, this.$refs.peakChart, this.relativeIntensityScale, this.toggleRelativeIntensityScale)
    },
    toggleRelativeIntensityScale() {
      this.relativeIntensityScale = !this.relativeIntensityScale
      this.redraw()
    },
  },
}

</script>
<style lang="scss" scoped>
  .peak-chart /deep/ .intensity-axis-label {
    text-anchor: middle;
    text-decoration-line: underline;
    text-decoration-style: dashed;
    cursor: pointer;
  }

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
    align-items: center;
    display: flex;
    flex-direction: column;
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
