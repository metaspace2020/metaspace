<template>
  <el-row>
    <div class="dataset-list">
      <div style="font: 24px 'Roboto', sans-serif; padding: 5px;">
        Recent uploads
      </div>
      <dataset-item v-for="(dataset, i) in datasets"
                    :dataset="dataset"
                    :class="[i%2 ? 'even': 'odd']">
      </dataset-item>
    </div>
  </el-row>
</template>

<script>
 import gql from 'graphql-tag';
 import DatasetItem from './DatasetItem.vue';

 export default {
   name: 'dataset-table',
   data () {
     return {
       datasets: [],
       currentPage: 0,
       recordsPerPage: 10,
       isLoading: true
     }
   },
   components: {
     DatasetItem
   },
   apollo: {
     datasets: {
       query: gql`query GetDatasets($dFilter: DatasetFilter) {
           allDatasets(offset: 0, limit: 100,
                       filter: $dFilter) {
         id
         name
         institution
         submitter {
           name
           surname
         }
         polarity
         ionisationSource
         analyzer {
           type
           resolvingPower(mz: 400)
         }
         metadataJson
       }}`,
       update(data) {
         this.isLoading = false;
         return data.allDatasets;
       },
       variables () {
         return {
           dFilter: this.$store.getters.gqlDatasetFilter
         }
       }
     }
   },
   methods: {
     formatSubmitter: (row, col) =>
       row.submitter.name + " " + row.submitter.surname,
     formatDatasetName: (row, col) =>
       row.name.split('//', 2)[1],
     formatResolvingPower: (row, col) =>
       (row.analyzer.resolvingPower / 1000).toFixed(0) * 1000
   }
 }
</script>

<style>
 .dataset-list {
   display: flex;
   flex-direction: column;
   height: 100%;
   align-items: center;
   justify-content: center;
 }

 .even {
   background-color: #e6f1ff;
 }

 .odd {
   background-color: white;
 }
</style>
