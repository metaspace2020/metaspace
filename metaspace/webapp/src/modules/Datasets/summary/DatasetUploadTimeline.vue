<template>
  <div v-loading="loading">
    <svg ref="uploadByDatePlot" />
  </div>
</template>

<script>
import { defineComponent, ref, watch, onMounted, inject } from 'vue'
import { useStore } from 'vuex'
import * as d3 from 'd3'
import gql from 'graphql-tag'
import { configureSvg, addAxes, addMainTitle, setTickSize } from './utils'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'

export default defineComponent({
  name: 'UploadTimelinePlot',
  setup() {
    const store = useStore()
    const uploadByDatePlot = ref(null)
    const apolloClient = inject(DefaultApolloClient)
    const QUERY_LIMIT = 50000
    const uploadDates = ref([])
    const loading = ref(false)

    // TODO: when number of datasets becomes too large, perform aggregation on the server side
    const query = gql`
      query GetUploadTimes($filter: DatasetFilter, $query: String, $offset: Int) {
        allDatasets(filter: $filter, simpleQuery: $query, offset: $offset, limit: ${QUERY_LIMIT}) {
          uploadDateTime
        }
      }
    `
    const countQuery = gql`
      query GetUploadTimesCount($filter: DatasetFilter, $query: String) {
        countDatasets(filter: $filter, simpleQuery: $query)
      }
    `

    const { refetch, onResult: onCountResult } = useQuery(countQuery, () => ({
      filter: { ...store.getters.gqlDatasetFilter, status: 'FINISHED' },
      query: store.getters.ftsQuery,
    }))

    onCountResult(async (result) => {
      const count = result.data.countDatasets

      loading.value = true

      let auxUploadDates = []
      for (let i = 0; i < count / QUERY_LIMIT; i += 1) {
        const resp = await apolloClient.query({
          query,
          variables: {
            filter: { ...store.getters.gqlDatasetFilter, status: 'FINISHED' },
            query: store.getters.ftsQuery,
            offset: i * QUERY_LIMIT,
          },
          fetchPolicy: 'cache-first',
        })
        auxUploadDates = auxUploadDates.concat(resp.data.allDatasets)
      }
      uploadDates.value = auxUploadDates.map((d) => d.uploadDateTime) || []
      loading.value = false
    })

    const geometry = { margin: { top: 30, bottom: 100, left: 70, right: 40 }, width: 600, height: 350 }

    watch(uploadDates, (newDates) => {
      const dates = newDates.filter((x) => x !== null).map((x) => d3.utcParse('%Y-%m-%dT%H:%M:%S')(x.split('.')[0]))
      dates.sort((a, b) => a - b)

      const elem = d3.select(uploadByDatePlot.value)
      elem.selectAll('*').remove()
      const svg = configureSvg(elem, geometry)

      const xScale = d3.scaleTime().domain(d3.extent(dates)).range([0, geometry.width])
      const yScale = d3.scaleLinear().domain([0, dates.length]).range([geometry.height, 0])

      addAxes(svg, geometry, { x: xScale, y: yScale })

      svg
        .append('g')
        .append('path')
        .attr(
          'd',
          d3
            .line()
            .x((d) => xScale(d))
            .y((d, i) => yScale(i))(dates)
        )
        .attr('stroke', 'blue')
        .attr('stroke-width', 2)
        .attr('fill', 'none')

      setTickSize('12px')

      addMainTitle(svg, geometry, 'Number of datasets uploaded to METASPACE').attr('font-size', '16px')
    })

    onMounted(() => {
      refetch()
    })

    return {
      loading,
      uploadByDatePlot,
    }
  },
})
</script>
