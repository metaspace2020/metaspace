<template>
  <div v-loading="loading">
    <svg ref="submitter_stats_plot" />
  </div>
</template>

<script>

import { configureSvg, addMainTitle } from './utils'
import { sortBy } from 'lodash-es'
import * as d3 from 'd3'
import gql from 'graphql-tag'

const query =
   gql`query GetSubmitterCounts($filter: DatasetFilter, $query: String) {
      countDatasetsPerGroup(query: {
        fields: [DF_GROUP, DF_SUBMITTER_NAME],
        filter: $filter,
        simpleQuery: $query
      }) {
        counts {
          fieldValues
          count
        }
      }
  }`

const geometry = {
  margin: {
    left: 150,
    top: 80,
    right: 20,
    bottom: 190,
  },
  height: 300,
  width: 500,
  pie: {
    maxRadius: 40,
  },
}

export default {
  name: 'SubmitterSummaryPlot',

  data() {
    return {
      loading: 0,
      counts: [],
    }
  },

  apollo: {
    counts: {
      query: query,
      loadingKey: 'loading',
      variables() {
        return {
          filter: Object.assign({ status: 'FINISHED' }, this.$store.getters.gqlDatasetFilter),
          query: this.$store.getters.ftsQuery,
        }
      },
      update(data) {
        return data.countDatasetsPerGroup.counts
      },
    },
  },

  computed: {
    data() {
      if (!this.counts) {
        return []
      }

      let result = []

      const OTHER = '(Other)'
      const submitters = {}
      const numDatasets = { [OTHER]: 0 }
      const numSubmitters = { [OTHER]: 0 }
      for (const entry of this.counts) {
        const lab = entry.fieldValues[0]
        submitters[lab] = []
        numDatasets[lab] = 0
        numSubmitters[lab] = 0
      }

      for (const entry of this.counts) {
        const [lab, name] = entry.fieldValues
        submitters[lab].push(name.toLowerCase())
        numDatasets[lab] += entry.count
      }

      for (const lab of Object.keys(submitters)) {
        result.push({
          lab,
          numDatasets: numDatasets[lab],
          numSubmitters: (new Set(submitters[lab])).size,
        })
      }

      const minNumDatasetsPerLab = result.map(x => x.numDatasets).sort((a, b) => b - a)[9] || 0

      for (const x of result) {
        if (x.numDatasets < minNumDatasetsPerLab) {
          numDatasets[OTHER] += x.numDatasets
          numSubmitters[OTHER] += x.numSubmitters
          x.numDatasets = x.numSubmitters = 0
        }
      }

      result.push({
        lab: OTHER,
        numDatasets: numDatasets[OTHER],
        numSubmitters: numSubmitters[OTHER],
      })
      result = sortBy(result,
        a => a.lab === OTHER,
        a => -a.numDatasets,
      )
      return result.filter(a => a.numDatasets > 0)
    },
  },

  watch: {
    data() {
      const { height, width } = geometry
      const elem = d3.select(this.$refs.submitter_stats_plot)
      elem.selectAll('*').remove()
      const svg = configureSvg(elem, geometry)

      const data = this.data
      const xScale = d3.scaleBand()
        .domain(data.map(d => d.lab))
        .range([0, geometry.width])
      const yScaleTop = d3.scaleLinear()
        .domain([0, d3.max(data.map(d => d.numDatasets))])
        .range([height / 2, 0])
      const yScaleBottom = d3.scaleLinear()
        .domain([0, d3.max(data.map(d => d.numSubmitters))])
        .range([height / 2, height])

      svg.selectAll('rect.ndatasets').data(data).enter()
        .append('rect')
        .attr('class', 'ndatasets')
        .attr('width', xScale.bandwidth() - 1)
        .attr('height', d => yScaleTop(0) - yScaleTop(d.numDatasets))
        .attr('x', d => xScale(d.lab))
        .attr('y', d => yScaleTop(d.numDatasets))
        .attr('fill', '#ccc')

      svg.selectAll('rect.nsubmitters').data(data).enter()
        .append('rect')
        .attr('class', 'nsubmitters')
        .attr('width', xScale.bandwidth() - 1)
        .attr('height', d => yScaleBottom(d.numSubmitters) - yScaleBottom(0))
        .attr('x', d => xScale(d.lab))
        .attr('y', yScaleBottom(0))
        .attr('fill', '#ccc')

      function drawYAxis(scale) {
        svg.append('g').call(d3.axisLeft(scale).tickSizeInner(-width).ticks(Math.min(10, scale.domain()[1])))
          .selectAll('.tick > line').style('opacity', 0.2).attr('stroke-dasharray', '5, 5')
      }

      drawYAxis(yScaleTop)
      drawYAxis(yScaleBottom)

      d3.selectAll('.tick > text').style('font-size', '14px')

      svg.append('g').call(d3.axisBottom(xScale).tickSize(null)).attr('transform', `translate(0, ${height / 2})`)
        .selectAll('text')
        .attr('transform', 'rotate(-80) translate(5, -20)')
        .style('text-anchor', 'start')
        .style('font-size', '14px')
        .style('fill', 'blue')

      const axisTitles = svg.append('g')
      axisTitles.append('text').text('Datasets')
        .attr('transform', `translate(-50, ${height / 4}) rotate(-90)`)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')

      axisTitles.append('text').text('Contributors')
        .attr('transform', `translate(-50, ${height * 3.0 / 4}) rotate(-90)`)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')

      addMainTitle(svg, geometry, 'Contributing labs').style('font-size', '16px')
    },
  },
}
</script>
