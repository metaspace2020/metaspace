<template>
  <div v-loading="loading">
    <svg ref="upload_by_date_plot" />
  </div>
</template>

<script>
import * as d3 from 'd3'
import gql from 'graphql-tag'
import { configureSvg, addAxes, addMainTitle, setTickSize } from './utils'

// TODO: when number of datasets becomes too large, perform aggregation on the server side
const query =
  gql`query GetUploadTimes($filter: DatasetFilter, $query: String) {
     allDatasets(filter: $filter, simpleQuery: $query, limit: 50000) {
       uploadDateTime
     }
  }`

const geometry = { margin: { top: 30, bottom: 100, left: 70, right: 40 }, width: 600, height: 350 }

export default {
  name: 'UploadTimelinePlot',

  data() {
    return {
      loading: 0,
      uploadDates: [],
    }
  },

  apollo: {
    uploadDates: {
      query: query,
      loadingKey: 'loading',
      variables() {
        return {
          filter: Object.assign({ status: 'FINISHED' }, this.$store.getters.gqlDatasetFilter),
          query: this.$store.getters.ftsQuery,
        }
      },
      update(data) {
        return data.allDatasets.map(d => d.uploadDateTime)
      },
    },
  },

  watch: {
    uploadDates() {
      const dates = this.uploadDates.filter(x => x !== null)
        .map(x => d3.utcParse('%Y-%m-%dT%H:%M:%S')(x.split('.')[0]))
      dates.sort((a, b) => a - b)

      const elem = d3.select(this.$refs.upload_by_date_plot)
      elem.selectAll('*').remove()
      const svg = configureSvg(elem, geometry)

      const xScale = d3.scaleTime().domain(d3.extent(dates)).range([0, geometry.width])
      const yScale = d3.scaleLinear().domain([0, dates.length]).range([geometry.height, 0])

      addAxes(svg, geometry, { x: xScale, y: yScale })

      svg.append('g').append('path')
        .attr('d', d3.line().x(d => xScale(d)).y((d, i) => yScale(i))(dates))
        .attr('stroke', 'blue').attr('stroke-width', 2).attr('fill', 'none')

      setTickSize('12px')

      addMainTitle(svg, geometry, 'Number of datasets uploaded to METASPACE')
        .attr('font-size', '16px')
    },
  },
}

</script>
