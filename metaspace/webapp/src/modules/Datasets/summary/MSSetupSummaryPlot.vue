<template>
  <div>
    <svg ref="mass_spec_setup_plot"></svg>
  </div>
</template>

<script>

 import {configureSvg, addLegend, pieScatterPlot, setTickSize} from './utils';
 import * as d3 from 'd3';
 import gql from 'graphql-tag';

 function matrixName(matrix) {
   const match = matrix.replace('_', ' ').match(/\(([A-Z0-9]{2,10})\)/i);
   if (match)
       return match[1];
   return matrix;
 }

 const strieq = (a, b) => String(a).localeCompare(String(b), undefined, {sensitivity: 'base'}) === 0;

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
  }`;

 const minGroupSize = process.env.NODE_ENV === 'development' ? 1 : 10;

 const geometry = {
   margin: {
     left: 150,
     top: 80,
     right: 20,
     bottom: 190
   },
   height: 300,
   width: 600,
   pie: {
     maxRadius: 35
   }
 };

 const config = {
   geometry,

   mainTitle: 'Number of datasets per analyzer/ion source/matrix',

   variables: {
     x: d => d.source,
     y: d => d.analyzer,
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
         label: 'Positive',
         count: d => d.counts.positive,
         color: '#e55'
       },
       {
         label: 'Negative',
         count: d => d.counts.negative,
         color: '#55e'
       }
     ]
   }
 };

 function drawMaldiCurlyBrace(svg, data, xScale) {
   const maldiData = data.filter(d => strieq(d.sourceType, 'maldi'));
   if (maldiData.length == 0)
     return;

   const maldiRange = d3.extent(maldiData.map(d => xScale(d.source)));

   const makeCurlyBrace = function(len, w, q) {
     return `M 0 0 Q 0 ${-q * w} ${0.25 * len} ${q * w - w} T ${0.5 * len} ${-w}` +
            `M ${len} 0 Q ${len} ${-q * w} ${0.75 * len} ${q * w - w} T ${0.5 * len} ${-w}`;
   }

   const maldiBrace = svg.append('g').attr('transform', `translate(${maldiRange[0]}, 0)`);

   const maldiWidth = maldiRange[1] - maldiRange[0] + xScale.bandwidth();
   maldiBrace
     .append('path')
     .attr('d', makeCurlyBrace(maldiWidth, -10, 0.6))
     .attr('stroke', 'black').attr('stroke-width', 1).attr('fill', 'none');

   maldiBrace
     .append('text')
     .attr('transform', `translate(${maldiWidth / 2}, 25)`)
     .attr('text-anchor', 'middle')
     .text('MALDI');

   return maldiBrace;
 }

 export default {
  name: 'mass-spec-setup-plot',

  data() {
    return {
      counts: []
    }
  },

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
      let prev = null;
      const inverted = {'positive': 'negative', 'negative': 'positive'}

      for (let entry of this.counts) {
        const [analyzer, source, matrix, polarity] = entry.fieldValues;
        if (strieq(analyzer, 'n/a') || strieq(source, 'n/a'))
          continue;
        if (strieq(source, 'maldi') && strieq(matrix, 'n/a'))
          continue;
        if (entry.count < minGroupSize)
          continue;

        const normalizedPolarity = String(polarity).toLowerCase();
        const datum = {
          analyzer,
          source: strieq(source, 'maldi') ? matrixName(matrix) : source,
          sourceType: source,
          counts: {
            [normalizedPolarity]: entry.count,
            [inverted[normalizedPolarity]]: 0
          },
          totalCount: entry.count
        }

        if (prev && ['analyzer', 'source', 'sourceType'].every(f => prev[f] == datum[f])) {
          ['positive', 'negative'].forEach(pol => { prev.counts[pol] += datum.counts[pol] });
          prev.totalCount += datum.totalCount;
        } else {
          result.push(datum);
          prev = datum;
        }
      }

      return result;
    }
  },

  watch: {
    data() {
      const elem = d3.select(this.$refs.mass_spec_setup_plot);
      elem.selectAll('*').remove();
      const svg = configureSvg(elem, geometry);

      const xData =
        d3.nest().key(d => d.sourceType + '@@' + d.source)
          .entries(this.data)
          .map(({key, values}) => ({
             key: key.split('@@')[1],
             sourceType: key.split('@@')[0],
             count: values.map(d => d.totalCount).reduce((x, y) => x + y)
           }))
          .sort((a, b) => {
            if (a.sourceType != b.sourceType) {
              if (strieq(a.sourceType, 'maldi'))
                return 1;
              if (strieq(b.sourceType, 'maldi'))
                return -1;
            }
            return b.count - a.count;
          });

      const {scales} = pieScatterPlot(svg, this.data, config, xData);

      const brace = drawMaldiCurlyBrace(svg, this.data, scales.x);
      if (brace)
        brace.attr('transform', function() {
          return this.getAttribute('transform') + ` translate(0, ${geometry.height + 100})`;
        });

      const polarities = config.pie.sectors.map(d => d.label + ' mode');
      addLegend(svg, polarities, d3.scaleOrdinal(config.pie.sectors.map(d => d.color)).domain(polarities))
         .attr('transform', `translate(${10-geometry.margin.left}, ${geometry.height + 80})`);

      setTickSize('12px');
    }
  }
 }
</script>
