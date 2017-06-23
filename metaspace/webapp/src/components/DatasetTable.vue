<template>
  <div id="dataset-page">
    <div id="dataset-page-contents">
      <div id="dataset-page-head">
        <filter-panel level="dataset"></filter-panel>

        <el-checkbox-group v-model="categories" :min=1 style="padding: 4px;">
          <el-checkbox class="cb-started" label="started">Processing {{ count('started') }}</el-checkbox>
          <el-checkbox class="cb-queued" label="queued">Queued {{ count('queued') }}</el-checkbox>
          <el-checkbox label="finished">Finished {{ count('finished') }}</el-checkbox>
        </el-checkbox-group>

        <div v-if="noFilters"
             style="font: 24px 'Roboto', sans-serif; padding: 5px;">
          <span v-if="noFilters">
            Recent uploads
          </span>
        </div>

        <div v-else
             style="font: 18px 'Roboto', sans-serif; padding: 5px;">
          <span v-if="nonEmpty">
            Search results in reverse chronological order
          </span>
          <span v-else>No datasets found</span>
        </div>

      </div>

      <div class="dataset-list">
        <dataset-item v-for="(dataset, i) in datasets"
                      :dataset="dataset"
                      :class="[i%2 ? 'even': 'odd']">
        </dataset-item>
      </div>
    </div>
  </div>
</template>

<script>
 import {datasetListQuery, datasetCountQuery} from '../api/dataset';
 import DatasetItem from './DatasetItem.vue';
 import FilterPanel from './FilterPanel.vue';
 import gql from 'graphql-tag';

 const processingStages = ['started', 'queued', 'finished'];

 export default {
   name: 'dataset-table',
   data () {
     return {
       currentPage: 0,
       recordsPerPage: 10,
       categories: processingStages
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

     nonEmpty() {
       return this.datasets.length > 0;
     },

     datasets() {
       let list = [];
       for (let category of processingStages)
         if (this.categories.indexOf(category) >= 0 && this[category])
           list = list.concat(this[category]);
       return list;
     }
   },

   apollo: {
     $subscribe: {
       datasetListUpdated: {
         query: gql`subscription DS {
           datasetStatusUpdated {
             datasetId
             status
           }
         }`,
         result(data) {
           // const {datasetId, status} = data.datasetStatusUpdated;
           this.$apollo.queries.started.refresh();
           this.$apollo.queries.queued.refresh();
           this.$apollo.queries.finished.refresh();
           this.$apollo.queries.finishedCount.refresh();
         }
       }
     },

     started: {
       forceFetch: true,
       query: datasetListQuery,
       update: data => data.allDatasets,
       variables () {
         return {
           dFilter: Object.assign({status: 'STARTED'},
                                  this.$store.getters.gqlDatasetFilter)
         }
       }
     },

     queued: {
       forceFetch: true,
       query: datasetListQuery,
       update: data => data.allDatasets,
       variables () {
         return {
           dFilter: Object.assign({status: 'QUEUED'},
                                  this.$store.getters.gqlDatasetFilter)
         }
       }
     },

     finished: {
       forceFetch: true,
       query: datasetListQuery,
       update: data => data.allDatasets,
       variables () {
         return {
           dFilter: Object.assign({status: 'FINISHED'},
                                  this.$store.getters.gqlDatasetFilter)
         }
       }
     },

     finishedCount: {
       forceFetch: true,
       query: datasetCountQuery,
       update: data => data.countDatasets,
       variables () {
         return {
           dFilter: Object.assign({status: 'FINISHED'},
                                  this.$store.getters.gqlDatasetFilter)
         }
       }
     },
   },

   methods: {
     formatSubmitter: (row, col) =>
       row.submitter.name + " " + row.submitter.surname,
     formatDatasetName: (row, col) =>
       row.name.split('//', 2)[1],
     formatResolvingPower: (row, col) =>
       (row.analyzer.resolvingPower / 1000).toFixed(0) * 1000,

     count(stage) {
       if (stage == 'finished')
         return this.finishedCount ? '(' + this.finishedCount + ')' : '';
       if (!this[stage])
         return '';
       return '(' + this[stage].length + ')';
     }
   }
 }
</script>

<style>

 #dataset-page {
   display: flex;
   justify-content: center;
 }

 /* 1 dataset per row by default*/
 #dataset-page-contents {
   display: inline-block;
   width: 820px;
 }

 .even {
   background-color: #e6f1ff;
 }

 .odd {
   background-color: white;
 }

 /* 2 datasets per row on wide screens */
 @media (min-width: 1650px) {
   #dataset-page-contents {
     width: 1620px;
   }

   .even {
     background-color: white !important;
   }
 }

 .dataset-list {
   display: flex;
   flex-direction: row;
   flex-wrap: wrap;
   align-items: center;
 }

 .cb-started .el-checkbox__input.is-checked .el-checkbox__inner {
   background: #5eed5e;
 }

 .cb-queued .el-checkbox__input.is-checked .el-checkbox__inner {
   background: #72c8e5;
 }
</style>
