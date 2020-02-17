import * as d3 from 'd3'

function configureSvg(svgElement: any, geometry: any) {
  const { margin, height, width } = geometry
  return svgElement
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g').attr('transform', `translate(${margin.left}, ${margin.top})`)
}

function addAxes(svg: any, geometry: any, scales: any) {
  svg.append('g').attr('transform', `translate(0, ${geometry.height})`)
    .call(d3.axisBottom(scales.x))
    .selectAll('text')
    .style('text-anchor', 'end')
    .attr('dx', '-.8em')
    .attr('dy', '.15em')
    .attr('transform', 'rotate(-45)')
  svg.append('g').call(d3.axisLeft(scales.y))
}

function addMainTitle(svg: any, geometry: any, title: string) {
  return svg.append('text').text(title)
    .attr('transform', `translate(${geometry.width / 2}, -10)`)
    .attr('text-anchor', 'middle')
}

function setTickSize(fontSize: string) {
  d3.selectAll('.tick > text').style('font-size', fontSize)
}

interface PieSector {
  label: string
  color: string
  count: (datum: any) => number
}

interface Pie {
  showCounts: boolean
  sectors: PieSector[]
}

interface PieChartVariables {
  x: (datum: any) => string
  y: (datum: any) => string
  count: (datum: any) => number
}
interface PieChartConfig {
  geometry: {
    margin: {
      left: number
      top: number
      right: number
      bottom: number
    }
    height: number
    width: number
    pie: {
      maxRadius: number
    }
  }
  mainTitle: string
  variables: PieChartVariables
  showSideHistograms: {
    x: boolean
    y: boolean
  }
  sideHistogramColor: string
  pie: Pie
}

interface EdgeHistogramBin {
  key: string
  count: number
}

type EdgeHistogram = EdgeHistogramBin[];

function pieScatterPlot(svg: any, data: any, config: PieChartConfig, xData: EdgeHistogram, yData: EdgeHistogram) {
  const { geometry, mainTitle, pie, variables } = config
  const { margin, height, width } = geometry

  const colors = d3.scaleOrdinal()
    .domain(pie.sectors.map(s => s.label))
    .range(pie.sectors.map(s => s.color))

  const xScale = d3.scaleBand().domain(xData.map(x => x.key)).rangeRound([0, width])
  const yScale = d3.scaleBand().domain(yData.map(x => x.key)).rangeRound([height, 0])

  const calcX = (d: any): number => xScale(variables.x(d)) || 0
  const calcY = (d: any): number => yScale(variables.y(d)) || 0

  const circle = svg.selectAll('g.pie').data(data).enter()
    .append('g').attr('class', 'pie')
    .attr('transform',
      (d: any) => `translate(${calcX(d) + xScale.bandwidth() / 2},
                                       ${calcY(d) + yScale.bandwidth() / 2})`)

  const counts: number[] = data.map(variables.count)
  const radiusScale = d3.scaleSqrt()
    .domain([0, d3.max(counts) || 0])
    .range([0, config.geometry.pie.maxRadius])

  const calcPie = (d: any) => d3.pie().sortValues(null)(pie.sectors.map(s => s.count(d)))
  const calcRadius = (d: any) => radiusScale(variables.count(d))

  circle.selectAll('path').data(calcPie).enter()
    .append('path')
    .attr('d', function(this: any, d: any) {
      const radius = calcRadius(d3.select(this.parentNode).datum())
      return d3.arc().innerRadius(0).outerRadius(radius)(d)
    })
    .style('fill', (d: any, i: number) => colors(pie.sectors[i].label))

  if (pie.showCounts) {
    circle.selectAll('text').data(calcPie).enter()
      .append('text')
      .attr('transform', function(this: any, d: any, i: number) {
        const radius = calcRadius(d3.select(this.parentNode).datum())
        // const arc = d3.arc().innerRadius(radius).outerRadius(radius);
        // return "translate(" + arc.centroid(d) + ")";
        return `translate(${radius + 3}, ${i * 15})`
      })
    // .attr("text-anchor", function(d) { return (d.endAngle + d.startAngle)/2 > Math.PI ? "end" : "start"; })
      .text((d: any): string => d.data === 0 ? '' : d.data)
      .style('fill', (d: any, i: number) => colors(pie.sectors[i].label))
  }

  if (config.showSideHistograms) {
    if (config.showSideHistograms.x) {
      const xL = d3.scaleLinear().domain([0, d3.max(yData.map(d => d.count))!]).range([0, -margin.left / 3 + 1])
      const yL = d3.scaleBand().domain(yData.map(d => d.key)).rangeRound([height, 0])
      svg.append('g').selectAll('rect.lhist').data(yData).enter()
        .append('rect').attr('class', 'lhist')
        .attr('x', (d: any) => xL(d.count))
        .attr('y', (d: any) => yL(d.key))
        .attr('width', (d: any) => -xL(d.count))
        .attr('height', yL.bandwidth() - 1)
        .attr('fill', config.sideHistogramColor)
        .style('stroke', '#888')
    }

    if (config.showSideHistograms.y) {
      const yL = d3.scaleLinear()
        .domain([0, d3.max(xData.map(d => d.count))!])
        .range([height, height + margin.bottom / 3 - 1])
      const xL = d3.scaleBand()
        .domain(xData.map(d => d.key))
        .rangeRound([0, width])
      svg.append('g').selectAll('rect.bhist').data(xData).enter()
        .append('rect').attr('class', 'bhist')
        .attr('y', yL(0)).attr('x', (d: any): number => xL(d.key) || 0)
        .attr('width', (d: any): number => xL.bandwidth() - 1)
        .attr('height', (d: any): number => yL(d.count) - yL(0))
        .attr('fill', config.sideHistogramColor)
        .style('stroke', '#888')
    }
  }

  addMainTitle(svg, geometry, mainTitle)
    .attr('font-size', '16px')

  addAxes(svg, geometry, { x: xScale, y: yScale })

  return {
    scales: {
      x: xScale,
      y: yScale,
      radius: radiusScale,
    },
  }
}

function addLegend(svg: any, labels: string[], colorScale: any) {
  const legend = svg.append('g')
  const itemHeight = 30
  const fontHeight = Math.round(itemHeight * 0.6)
  legend.append('rect')
    .attr('width', fontHeight * 0.8 * (d3.max(labels.map(d => d.length)) || 10))
    .attr('height', itemHeight * labels.length + 10 * 2)
    .attr('fill', 'none')
    .attr('stroke', 'black')
  let k = 1
  for (const label of labels) {
    const item = legend.append('g').attr('transform', `translate(10, ${k * itemHeight})`)
    item.append('circle')
      .attr('fill', colorScale(label))
      .attr('r', 10).attr('cx', 10).attr('cy', -itemHeight / 4)
    item.append('text').text(label).attr('x', 30).attr('font-size', fontHeight + 'px')
    k += 1
  }
  return legend
}

export {
  addAxes,
  addLegend,
  addMainTitle,
  configureSvg,
  pieScatterPlot,
  setTickSize,
}
