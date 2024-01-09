<template>
  <div v-loading="loading">
    <svg ref="massSpecSetupPlot" />
  </div>
</template>

<script>

import { configureSvg, addLegend, pieScatterPlot, setTickSize } from './utils'
import * as d3 from 'd3'
import gql from 'graphql-tag'
import { groupBy, map, sumBy, sortBy, orderBy } from 'lodash-es'
import {defineComponent, ref, watch, onMounted, computed} from 'vue';
import {useStore} from "vuex";
import {useQuery} from "@vue/apollo-composable";


export default defineComponent({
  name: 'MassSpecSetupPlot',
  setup() {
    const store = useStore();
    const massSpecSetupPlot = ref(null);


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

    const { result: countsResult, loading, refetch } = useQuery(query,
      () => ({
        filter: Object.assign({ status: 'FINISHED' }, store.getters.gqlDatasetFilter),
        query: store.getters.ftsQuery,
      }));
    const counts = computed(() => countsResult.value?.countDatasetsPerGroup?.counts)

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

    const chartData = computed(() => {
      if (!counts.value) {
        return []
      }

      const inverted = { positive: 'negative', negative: 'positive' }
      const analyzerCounts = {}
      const sourceCounts = {}
      const matrixCounts = {}

      const normedCounts = counts.value.map(entry => {
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
    })


    // Watch the data and draw the chart
    watch(counts, () => {
      const elem = d3.select(massSpecSetupPlot.value);
      elem.selectAll('*').remove()
      const svg = configureSvg(elem, geometry)

      let xData = map(groupBy(chartData.value, d => d.isMaldi + '@@' + d.sourceType), (items) => ({
        key: items[0].sourceType,
        count: sumBy(items, 'totalCount'),
        isMaldi: items[0].isMaldi,
        isOther: items[0].sourceType === OTHER_SOURCE || items[0].sourceType === OTHER_MATRIX,
      }))
      xData = orderBy(xData, ['isMaldi', 'isOther', 'count'], ['asc', 'asc', 'desc'])
      let yData = map(groupBy(chartData.value, 'analyzer'), (items, analyzer) => ({
        key: analyzer,
        count: sumBy(items, 'totalCount'),
        isOther: analyzer === OTHER_ANALYZER,
      }))
      yData = orderBy(yData, ['isOther', 'count'], ['desc', 'desc'])

      const { scales } = pieScatterPlot(svg, chartData.value, config, xData, yData)

      const brace = drawMaldiCurlyBrace(svg, chartData.value, scales.x)
      if (brace) {
        brace.attr('transform', function() {
          return this.getAttribute('transform') + ` translate(0, ${geometry.height + 100})`
        })
      }

      const polarities = config.pie.sectors.map(d => d.label + ' mode')
      addLegend(svg, polarities, d3.scaleOrdinal(config.pie.sectors.map(d => d.color)).domain(polarities))
        .attr('transform', `translate(${10 - geometry.margin.left}, ${geometry.height + 80})`)

      setTickSize('12px')
    });


    onMounted(() => {
      refetch()
    })

    return {
      loading,
      massSpecSetupPlot,
    };
  },
});
</script>
