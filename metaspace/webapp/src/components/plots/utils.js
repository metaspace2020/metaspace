import * as d3 from 'd3';

function configureSvg(svgElement, geometry) {
    const {margin, height, width} = geometry;
    return svgElement
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);
}

function addAxes(svg, geometry, scales) {
    svg.append('g').attr('transform', `translate(0, ${geometry.height})`)
       .call(d3.axisBottom(scales.x))
        .selectAll('text')
          .style('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em')
            .attr('transform', 'rotate(-45)');
    svg.append('g').call(d3.axisLeft(scales.y));
}

function addMainTitle(svg, geometry, title) {
    return svg.append('text').text(title)
        .attr('transform', `translate(${geometry.width / 2}, -10)`)
        .attr('text-anchor', 'middle');
}

function setTickSize(fontSize) {
    d3.selectAll('.tick > text').style('font-size', fontSize);
}

function pieScatterPlot(svg, data, config, xData_=null, yData_=null) {
    const {variables, pie, geometry, mainTitle} = config;
    const {margin, height, width} = geometry;

    const colors = d3.scaleOrdinal()
        .domain(pie.sectors.map(s => s.label))
        .range(pie.sectors.map(s => s.color));

    const defaultXSort = (a, b) => b.count - a.count;
    const defaultYSort = (a, b) => a.count - b.count;

    const xData = xData_ || d3.nest().key(variables.x).entries(data)
      .map(({key, values}) => ({ key, count: values.map(variables.count).reduce((x, y) => x + y)}))
      .sort(defaultXSort)

    const yData = yData_ || d3.nest().key(variables.y).entries(data)
      .map(({key, values}) => ({ key, count: values.map(variables.count).reduce((x, y) => x + y)}))
      .sort(defaultYSort);

    const xScale = d3.scaleBand().domain(xData.map(x => x.key)).rangeRound([0, width]);
    const yScale = d3.scaleBand().domain(yData.map(x => x.key)).rangeRound([height, 0]);

    const calcX = d => xScale(variables.x(d));
    const calcY = d => yScale(variables.y(d));

    const circle = svg.selectAll('g.pie').data(data).enter()
        .append("g").attr('class', 'pie')
          .attr("transform",
                d => `translate(${calcX(d) + xScale.bandwidth() / 2},
                                ${calcY(d) + yScale.bandwidth() / 2})`);

    const radiusScale = d3.scaleSqrt()
        .domain([0, d3.max(data.map(variables.count))])
        .range([0, config.geometry.pie.maxRadius]);

    const calcPie = d => d3.pie().sortValues(null)(pie.sectors.map(s => s.count(d)));
    const calcRadius = d => radiusScale(variables.count(d));

    circle.selectAll("path").data(calcPie).enter()
        .append("path")
        .attr("d", function(d) {
            const radius = calcRadius(d3.select(this.parentNode).datum());
            return d3.arc().innerRadius(0).outerRadius(radius)(d);
        })
        .style("fill", (d, i) => colors(pie.sectors[i].label))

    if (pie.showCounts)
        circle.selectAll("text").data(calcPie).enter()
            .append("text")
            .attr("transform", function(d, i) {
                const radius = calcRadius(d3.select(this.parentNode).datum());
                //const arc = d3.arc().innerRadius(radius).outerRadius(radius);
                //return "translate(" + arc.centroid(d) + ")";
                return `translate(${radius + 3}, ${i * 15})`;
            })
            //.attr("text-anchor", function(d) { return (d.endAngle + d.startAngle)/2 > Math.PI ? "end" : "start"; })
            .text(d => d.data == 0 ? '' : d.data).style('fill', (d, i) => colors(pie.sectors[i].label));

    if (config.showSideHistograms) {
        if (config.showSideHistograms.x) {
            const xL = d3.scaleLinear().domain([0, d3.max(yData.map(d => d.count))]).range([0, -margin.left / 3 + 1]);
            const yL = d3.scaleBand().domain(yData.map(d => d.key)).rangeRound([height, 0]);
            svg.append('g').selectAll('rect.lhist').data(yData).enter()
                .append('rect').attr('class', 'lhist').attr('x', d => xL(d.count)).attr('y', d => yL(d.key))
                .attr('width', d => -xL(d.count))
                .attr('height', yL.bandwidth() - 1)
                .attr('fill', config.sideHistogramColor)
                .style('stroke', '#888');
        }

        if (config.showSideHistograms.y) {
            const yL = d3.scaleLinear().domain([0, d3.max(xData.map(d => d.count))]).range([height, height + margin.bottom / 3 - 1]);
            const xL = d3.scaleBand().domain(xData.map(d => d.key)).rangeRound([0, width]);
            svg.append('g').selectAll('rect.bhist').data(xData).enter()
                .append('rect').attr('class', 'bhist').attr('y', yL(0)).attr('x', d => xL(d.key))
                .attr('width', d => xL.bandwidth() - 1)
                .attr('height', d => yL(d.count) - yL(0))
                .attr('fill', config.sideHistogramColor)
                .style('stroke', '#888');

        }
    }

    addMainTitle(svg, geometry, mainTitle)
        .attr('font-size', '16px');

    addAxes(svg, geometry, {x: xScale, y: yScale});

    return {
        scales: {
            x: xScale,
            y: yScale,
            radius: radiusScale
        }
    }
}

function addLegend(svg, labels, colorScale) {
    const legend = svg.append("g");
    let itemHeight = 30,
        fontHeight = Math.round(itemHeight * 0.6);
    legend.append('rect')
        .attr('width', fontHeight * 0.8 * d3.max(labels.map(d => d.length)))
        .attr('height', itemHeight * labels.length + 10 * 2)
        .attr('fill', 'none')
        .attr('stroke', 'black');
    let k = 1;
    for (let label of labels) {
        const item = legend.append('g').attr('transform', `translate(10, ${k * itemHeight})`);
        item.append('circle')
            .attr('fill', colorScale(label))
            .attr('r', 10).attr('cx', 10).attr('cy', -itemHeight/4);
        item.append('text').text(label).attr('x', 30).attr('font-size', fontHeight + 'px');
        k += 1;
    }
    return legend;
}

export {
  addAxes,
  addLegend,
  addMainTitle,
  configureSvg,
  pieScatterPlot,
  setTickSize
}
