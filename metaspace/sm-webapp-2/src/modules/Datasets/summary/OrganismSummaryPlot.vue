<template>
  <div v-loading="loading">
    <svg ref="organismSummaryPlot" />
  </div>
</template>

<script>
import { defineComponent, ref, onMounted, watch, computed } from 'vue'
import { useStore } from 'vuex'
import * as d3 from 'd3'
import gql from 'graphql-tag'
import { groupBy, sumBy, sortBy, map } from 'lodash-es'
import { configureSvg, pieScatterPlot, setTickSize } from './utils'
import { useQuery } from '@vue/apollo-composable'

export default defineComponent({
  name: 'OrganismSummaryPlot',
  setup() {
    const store = useStore()
    const organismSummaryPlot = ref(null)

    const query = gql`
      query GetOrganismOrganCounts($filter: DatasetFilter, $query: String) {
        countDatasetsPerGroup(
          query: { fields: [DF_ORGANISM, DF_ORGANISM_PART], filter: $filter, simpleQuery: $query }
        ) {
          counts {
            fieldValues
            count
          }
        }
      }
    `

    const {
      result: countsResult,
      loading,
      refetch,
    } = useQuery(query, () => ({
      filter: Object.assign({ status: 'FINISHED' }, store.getters.gqlDatasetFilter),
      query: store.getters.ftsQuery,
    }))
    const counts = computed(() => countsResult.value?.countDatasetsPerGroup?.counts)

    const OTHER = '(other)'
    const geometry = {
      margin: {
        left: 200,
        top: 80,
        right: 20,
        bottom: 200,
      },
      height: 350,
      width: 600,
      pie: {
        maxRadius: 10,
      },
    }

    const config = {
      geometry,

      mainTitle: 'Number of datasets per species/organ type',

      variables: {
        x: (d) => d.organism,
        y: (d) => d.organismPart,
        count: (d) => d.count,
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
            label: 'Total',
            count: (d) => d.count,
            color: '#55e',
          },
        ],
      },
    }

    const chartData = computed(() => {
      if (!counts.value) {
        return []
      }

      const countBy = (array, iterator) => {
        const groups = groupBy(array, iterator)
        const counts = map(groups, (entries, key) => [key, sumBy(entries, 'count')])
        return sortBy(counts, ([, count]) => -count)
      }
      const topNBy = (array, n, iterator) => {
        return countBy(array, iterator)
          .slice(0, n)
          .map(([key]) => key)
      }

      let rows = counts.value
        .filter((entry) => !entry.fieldValues.includes('N/A') && entry.count > 0)
        .map(({ fieldValues: [organism, organismPart], count }) => ({ organism, organismPart, count }))

      // Group categories that aren't in the top N into "Other" categories
      const topOrganisms = topNBy(rows, 25, 'organism')
      const topOrganismParts = topNBy(rows, 25, 'organismPart')
      rows = map(rows, ({ organism, organismPart, count }) => ({
        organism: topOrganisms.includes(organism) ? organism : OTHER,
        organismPart: topOrganismParts.includes(organismPart) ? organismPart : OTHER,
        count,
      }))
      rows = groupBy(rows, ({ organism, organismPart }) => `${organism}|||${organismPart}`)
      rows = map(rows, (group) => ({ ...group[0], count: sumBy(group, 'count') }))

      // Collect & sort categories for axis histograms, putting "Other" at the low end of each axis
      let xData = countBy(rows, 'organism').map(([key, count]) => ({ key, count }))
      xData = sortBy(xData, ({ key, count }) => (key === OTHER ? Infinity : -count))
      let yData = countBy(rows, 'organismPart').map(([key, count]) => ({ key, count }))
      yData = sortBy(yData, ({ key, count }) => (key === OTHER ? -Infinity : count))

      return [rows, xData, yData]
    })

    // Watch state.data and draw the chart
    watch(counts, () => {
      const elem = d3.select(organismSummaryPlot.value)
      elem.selectAll('*').remove()
      const svg = configureSvg(elem, geometry)
      const [data, xData, yData] = chartData.value
      pieScatterPlot(svg, data, config, xData, yData)
      setTickSize('12px')
    })

    onMounted(() => {
      refetch()
    })

    return {
      loading,
      organismSummaryPlot,
    }
  },
})
</script>
