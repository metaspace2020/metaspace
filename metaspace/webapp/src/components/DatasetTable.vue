<template>
  <el-row>
    <filter-panel level="dataset"></filter-panel>

    <div class="dataset-list">
      <div v-if="noFilters"
           style="font: 24px 'Roboto', sans-serif; padding: 5px;">
        <span v-if="noFilters">
          Recent uploads
        </span>
      </div>

      <div v-else
           style="font: 18px 'Roboto', sans-serif; padding: 5px;">
        <span v-if="datasets.length > 0">
          Search results in reverse chronological order
        </span>
        <span v-else>No datasets found</span>
      </div>

      <dataset-item v-for="(dataset, i) in started"
                    :dataset="dataset"
                    :key="dataset.id"
                    :class="[i%2 ? 'even': 'odd']">
      </dataset-item>

      <dataset-item v-for="(dataset, i) in queued"
                    :dataset="dataset"
                    :key="dataset.id"
                    :class="[(i + started.length)%2 ? 'even': 'odd']">
      </dataset-item>

      <dataset-item v-for="(dataset, i) in finished"
                    :dataset="dataset"
                    :key="dataset.id"
                    :class="[(i + started.length + queued.length)%2 ? 'even': 'odd']">
      </dataset-item>
    </div>
  </el-row>
</template>

<script>
 import {datasetListQuery} from '../api/dataset';
 import DatasetItem from './DatasetItem.vue';
 import FilterPanel from './FilterPanel.vue';

 export default {
   name: 'dataset-table',
   data () {
     return {
       datasets: [],
       currentPage: 0,
       recordsPerPage: 10
     }
   },
   components: {
     DatasetItem,
     FilterPanel
   },

   computed: {
     noFilters() {
       const df = this.$store.getters.filter;
       for (var key in df)
         if (df[key]) return false;
       return true;
     },
   },

   apollo: {
     started: {
       query: datasetListQuery,
       update(data) {
         return data.allDatasets;
       },
       variables () {
         return {
           dFilter: Object.assign({status: 'STARTED'},
                                  this.$store.getters.gqlDatasetFilter)
         }
       },
       pollInterval: 30000
     },

     queued: {
       query: datasetListQuery,
       update(data) {
         return data.allDatasets;
       },
       variables () {
         return {
           dFilter: Object.assign({status: 'QUEUED'},
                                  this.$store.getters.gqlDatasetFilter)
         }
       },
       pollInterval: 30000
     },

     finished: {
       query: datasetListQuery,
       update(data) {
         return data.allDatasets;
       },
       variables () {
         return {
           dFilter: Object.assign({status: 'FINISHED'},
                                  this.$store.getters.gqlDatasetFilter)
         }
       },
       pollInterval: 30000
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
