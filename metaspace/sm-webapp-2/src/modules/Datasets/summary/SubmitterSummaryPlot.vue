<template>
  <div v-loading="loading">
    <svg ref="submitterStatsPlot" />
  </div>
</template>

<script>
import {defineComponent, ref, watch, onMounted, computed} from 'vue';
import {useStore} from 'vuex';
import {configureSvg, addMainTitle} from './utils';
import {sortBy} from 'lodash-es';
import * as d3 from 'd3';
import gql from 'graphql-tag';
import {useQuery} from "@vue/apollo-composable";

export default defineComponent({
  name: 'SubmitterSummaryPlot',
  setup() {
    const store = useStore();
    const submitterStatsPlot = ref(null);

    const query = gql`query GetSubmitterCounts($filter: DatasetFilter, $query: String) {
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
    }`;

    const { result: countsResult, loading, refetch } = useQuery(query,
      () => ({
        filter: Object.assign({ status: 'FINISHED' }, store.getters.gqlDatasetFilter),
        query: store.getters.ftsQuery,
      }));
    const counts = computed(() => countsResult.value?.countDatasetsPerGroup?.counts)

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

    const chartData = computed(() => {
      if (!counts.value) {
        return []
      }

      let result = []

      const OTHER = '(Other)'
      const submitters = {}
      const numDatasets = { [OTHER]: 0 }
      const numSubmitters = { [OTHER]: 0 }
      for (const entry of counts.value) {
        const lab = entry.fieldValues[0]
        submitters[lab] = []
        numDatasets[lab] = 0
        numSubmitters[lab] = 0
      }

      for (const entry of counts.value) {
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
    })

    watch(counts, () => {
      const { height, width } = geometry
      const elem = d3.select(submitterStatsPlot.value);
      elem.selectAll('*').remove()
      const svg = configureSvg(elem, geometry)

      const data = chartData.value
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
    });

    onMounted(() => {
      refetch()
    })

    return {
      loading,
      submitterStatsPlot,
    };
  },
});
</script>
