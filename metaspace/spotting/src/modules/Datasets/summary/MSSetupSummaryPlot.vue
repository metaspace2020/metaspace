<template>
  <div v-loading="loading">
    <svg ref="mass_spec_setup_plot" />
  </div>
</template>

<script>

import { configureSvg, addLegend, pieScatterPlot, setTickSize } from './utils'
import * as d3 from 'd3'
import gql from 'graphql-tag'
import { groupBy, map, mapValues, sumBy, sortBy, orderBy, without } from 'lodash-es'

const MALDI = 'maldi'
const OTHER_ANALYZER = '(other analyzer)'
const OTHER_SOURCE = '(other ion source)'
const OTHER_MATRIX = '(other matrix)'

function matrixName(matrix) {
  if (matrix !== OTHER_MATRIX) {
    const match = matrix.replace('_', ' ').match(/\(([A-Z0-9]{2,10})\)/i)
    if (match) {
      return match[1]
    }
  }
  return matrix
}

const query =
   gql`query GetMSSetupCounts($filter: DatasetFilter, $query: String) {
      countDatasetsPerGroup(query: {
        fields: [DF_ANALYZER_TYPE, DF_ION_SOURCE, DF_MALDI_MATRIX, DF_POLARITY],
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
  width: 600,
  pie: {
    maxRadius: 35,
  },
}

const config = {
  geometry,

  mainTitle: 'Number of datasets per analyzer/ion source/matrix',

  variables: {
    x: d => d.sourceType,
    y: d => d.analyzer,
    count: d => d.totalCount,
  },

  showSideHistograms: {
    x: true,
    y: true,
  },

  sideHistogramColor: 'rgb(170, 204, 255)',

  pie: {
    showCounts: true,
    sectors: [
      {
        label: 'Positive',
        count: d => d.counts.positive,
        color: '#e55',
      },
      {
        label: 'Negative',
        count: d => d.counts.negative,
        color: '#55e',
      },
    ],
  },
}

const isSourceMaldi = sourceType => /maldi/i.test(sourceType)
const isNA = val => /^(n\/?a|none|other|\s*)$/i.test(val)

function drawMaldiCurlyBrace(svg, data, xScale) {
  const maldiData = data.filter(d => d.isMaldi)
  if (maldiData.length === 0) {
    return
  }

  const maldiRange = d3.extent(maldiData.map(d => xScale(d.sourceType)))

  const makeCurlyBrace = function(len, w, q) {
    return `M 0 0 Q 0 ${-q * w} ${0.25 * len} ${q * w - w} T ${0.5 * len} ${-w}`
            + `M ${len} 0 Q ${len} ${-q * w} ${0.75 * len} ${q * w - w} T ${0.5 * len} ${-w}`
  }

  const maldiBrace = svg.append('g').attr('transform', `translate(${maldiRange[0]}, 0)`)

  const maldiWidth = maldiRange[1] - maldiRange[0] + xScale.bandwidth()
  maldiBrace
    .append('path')
    .attr('d', makeCurlyBrace(maldiWidth, -10, 0.6))
    .attr('stroke', 'black').attr('stroke-width', 1).attr('fill', 'none')

  maldiBrace
    .append('text')
    .attr('transform', `translate(${maldiWidth / 2}, 25)`)
    .attr('text-anchor', 'middle')
    .text('MALDI')

  return maldiBrace
}

export default {
  name: 'MassSpecSetupPlot',

  data() {
    return {
      counts: [],
      loading: 0,
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

      const inverted = { positive: 'negative', negative: 'positive' }
      const analyzerCounts = {}
      const sourceCounts = {}
      const matrixCounts = {}

      const normedCounts = this.counts.map(entry => {
        let [analyzer, source, matrix, polarity] = entry.fieldValues
        const isMaldi = isSourceMaldi(source)
        if (isNA(analyzer)) {
          analyzer = OTHER_ANALYZER
        } else {
          analyzerCounts[analyzer] = (analyzerCounts[analyzer] || 0) + entry.count
        }
        if (isNA(source)) {
          source = OTHER_SOURCE
        } else if (!isMaldi) {
          sourceCounts[source] = (sourceCounts[source] || 0) + entry.count
        }
        if (isMaldi) {
          if (isNA(matrix)) {
            matrix = OTHER_MATRIX
          } else {
            matrix = matrixName(matrix)
            matrixCounts[matrix] = (matrixCounts[matrix] || 0) + entry.count
          }
        }
        polarity = String(polarity).toLowerCase()

        return {
          analyzer,
          sourceType: isMaldi ? matrix : source,
          isMaldi,
          polarity,
          count: entry.count,
        }
      })

      // Limit to the top 10 analyzers/sources/matrixes. Change everything else to "Other"
      const topAnalyzers = sortBy(Object.entries(analyzerCounts), 1).map(([key]) => key).slice(-10)
      const topSources = sortBy(Object.entries(sourceCounts), 1).map(([key]) => key).slice(-6)
      const topMatrixes = sortBy(Object.entries(matrixCounts), 1).map(([key]) => key).slice(-10)
      normedCounts.forEach(entry => {
        if (!topAnalyzers.includes(entry.analyzer)) {
          entry.analyzer = OTHER_ANALYZER
        }
        if (!entry.isMaldi && !topSources.includes(entry.sourceType)) {
          entry.sourceType = OTHER_SOURCE
        }
        if (entry.isMaldi && !topMatrixes.includes(entry.sourceType)) {
          entry.sourceType = OTHER_MATRIX
        }
      })

      // Group by analyzer, isMaldi and sourceType. Sum counts by polarity.
      const result = []
      normedCounts.forEach(({ analyzer, isMaldi, sourceType, polarity, count }) => {
        const datum = {
          analyzer,
          isMaldi,
          sourceType,
          counts: {
            [polarity]: count,
            [inverted[polarity]]: 0,
          },
          totalCount: count,
        }
        const existing = result.find(other => ['analyzer', 'isMaldi', 'sourceType'].every(f => other[f] === datum[f]))
        if (existing) {
          ['positive', 'negative'].forEach(pol => { existing.counts[pol] += datum.counts[pol] })
          existing.totalCount += datum.totalCount
        } else {
          result.push(datum)
        }
      })

      return result
    },
  },

  watch: {
    data() {
      const elem = d3.select(this.$refs.mass_spec_setup_plot)
      elem.selectAll('*').remove()
      const svg = configureSvg(elem, geometry)

      let xData = map(groupBy(this.data, d => d.isMaldi + '@@' + d.sourceType), (items) => ({
        key: items[0].sourceType,
        count: sumBy(items, 'totalCount'),
        isMaldi: items[0].isMaldi,
        isOther: items[0].sourceType === OTHER_SOURCE || items[0].sourceType === OTHER_MATRIX,
      }))
      xData = orderBy(xData, ['isMaldi', 'isOther', 'count'], ['asc', 'asc', 'desc'])
      let yData = map(groupBy(this.data, 'analyzer'), (items, analyzer) => ({
        key: analyzer,
        count: sumBy(items, 'totalCount'),
        isOther: analyzer === OTHER_ANALYZER,
      }))
      yData = orderBy(yData, ['isOther', 'count'], ['desc', 'desc'])

      const { scales } = pieScatterPlot(svg, this.data, config, xData, yData)

      const brace = drawMaldiCurlyBrace(svg, this.data, scales.x)
      if (brace) {
        brace.attr('transform', function() {
          return this.getAttribute('transform') + ` translate(0, ${geometry.height + 100})`
        })
      }

      const polarities = config.pie.sectors.map(d => d.label + ' mode')
      addLegend(svg, polarities, d3.scaleOrdinal(config.pie.sectors.map(d => d.color)).domain(polarities))
        .attr('transform', `translate(${10 - geometry.margin.left}, ${geometry.height + 80})`)

      setTickSize('12px')
    },
  },
}
</script>
