<template>
  <div>
    <svg ref="organism_summary_plot">
    </svg>
  </div>
</template>

<script>

 import {configureSvg, addLegend, pieScatterPlot, setTickSize} from './utils';
 import * as d3 from 'd3';
 import gql from 'graphql-tag';

 const query =
   gql`query GetOrganismOrganCounts($filter: DatasetFilter, $query: String) {
      countDatasetsPerGroup(query: {
        fields: [DF_ORGANISM, DF_ORGANISM_PART],
        filter: $filter,
        simpleQuery: $query
      }) {
        counts {
          fieldValues
          count
        }
      }
  }`;

 const minGroupSize = 10;

 const geometry = {
   margin: {
     left: 200,
     top: 80,
     right: 20,
     bottom: 200
   },
   height: 350,
   width: 600,
   pie: {
     maxRadius: 10
   }
 };

 const config = {
     geometry,

     mainTitle: 'Number of datasets per species/organ type',

     variables: {
         x: d => d.organism,
         y: d => d.organismPart,
         count: d => d.totalCount
     },

     showSideHistograms: {
         x: true,
         y: true
     },

     sideHistogramColor: 'rgb(170, 204, 255)',

     pie: {
         showCounts: true,
         sectors: [
             {
                 label: 'Total',
                 count: d => d.totalCount,
                 color: '#55e'
             }
         ]
     }
 };

 export default {
  name: 'organism-summary-plot',

  apollo: {
    counts: {
      query: query,
      variables() {
        return {
          filter: Object.assign({status: 'FINISHED'}, this.$store.getters.gqlDatasetFilter),
          query: this.$store.getters.ftsQuery
        };
      },
      update(data) {
        return data.countDatasetsPerGroup.counts;
      }
    }
  },

  computed: {
    data() {
      if (!this.counts)
        return [];

      let result = [];

      for (let entry of this.counts) {
        if (entry.fieldValues.indexOf('N/A') >= 0)
          continue;
        if (entry.count < minGroupSize)
          continue;

        const [organism, organismPart] = entry.fieldValues;

        result.push({
          organism,
          organismPart,
          totalCount: entry.count
        });
      }

      result.sort((a, b) => {
        return a.totalCount - b.totalCount;
      });

      return result;
    }
  },

  watch: {
    data() {
      const elem = d3.select(this.$refs.organism_summary_plot);
      elem.selectAll('*').remove();
      const svg = configureSvg(elem, geometry);
      const {scales} = pieScatterPlot(svg, this.data, config);

      setTickSize('12px');
    }
  }
 }
</script>
