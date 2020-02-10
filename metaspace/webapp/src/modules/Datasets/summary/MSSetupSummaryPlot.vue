<template>
  <div>
    <svg ref="mass_spec_setup_plot" />
  </div>
</template>

<script>

import { configureSvg, addLegend, pieScatterPlot, setTickSize } from './utils'
import * as d3 from 'd3'
import gql from 'graphql-tag'
import { sortBy } from 'lodash-es'

function matrixName(matrix) {
  const match = matrix.replace('_', ' ').match(/\(([A-Z0-9]{2,10})\)/i)
  if (match) {
    return match[1]
  }
  return matrix
}

const strieq = (a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }) === 0

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
    x: d => d.source,
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

const isMaldi = sourceType => /maldi/i.test(sourceType)
const isNA = sourceType => /n\/a|none|^\s*$/i.test(sourceType)

function drawMaldiCurlyBrace(svg, data, xScale) {
  const maldiData = data.filter(d => isMaldi(d.sourceType))
  if (maldiData.length === 0) {
    return
  }

  const maldiRange = d3.extent(maldiData.map(d => xScale(d.source)))

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
    }
  },

  apollo: {
    counts: {
      query: query,
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
      const inverted = { positive: 'negative', negative: 'positive' }

      for (const entry of this.counts) {
        let [analyzer, source, matrix, polarity] = entry.fieldValues
        if (isNA(analyzer)) {
          analyzer = '(Other)'
        }
        if (isNA(source)) {
          source = '(Other)'
        }
        if (isMaldi(source) && isNA(matrix)) {
          matrix = '(Other)'
        }

        const normalizedPolarity = String(polarity).toLowerCase()
        const datum = {
          analyzer,
          source: isMaldi(source) ? matrixName(matrix) : source,
          sourceType: isMaldi(source) ? 'maldi' : source,
          counts: {
            [normalizedPolarity]: entry.count,
            [inverted[normalizedPolarity]]: 0,
          },
          totalCount: entry.count,
        }
        const existing = result.find(other => ['analyzer', 'source', 'sourceType'].every(f => other[f] === datum[f]))
        if (existing) {
          ['positive', 'negative'].forEach(pol => { existing.counts[pol] += datum.counts[pol] })
          existing.totalCount += datum.totalCount
        } else {
          result.push(datum)
        }
      }
      result = sortBy(result,
        datum => datum.sourceType === 'maldi',
        datum => datum.source === '(Other)',
        datum => -datum.totalCount,
      )

      return result
    },
  },

  watch: {
    data() {
      const elem = d3.select(this.$refs.mass_spec_setup_plot)
      elem.selectAll('*').remove()
      const svg = configureSvg(elem, geometry)

      const xData =
        d3.nest().key(d => d.sourceType + '@@' + d.source)
          .entries(this.data)
          .map(({ key, values }) => ({
            key: key.split('@@')[1],
            sourceType: key.split('@@')[0],
            count: values.map(d => d.totalCount).reduce((x, y) => x + y),
          }))
          .sort((a, b) => {
            if (a.sourceType !== b.sourceType && !(isMaldi(a.sourceType) && isMaldi(b.sourceType))) {
              if (isMaldi(a.sourceType)) {
                return 1
              }
              if (isMaldi(b.sourceType)) {
                return -1
              }
            }
            return b.count - a.count
          })

      const { scales } = pieScatterPlot(svg, this.data, config, xData)

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
