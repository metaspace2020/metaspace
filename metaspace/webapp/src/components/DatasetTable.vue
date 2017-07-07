<template>
  <div id="dataset-page">
    <div id="dataset-page-contents">
      <div id="dataset-page-head">
        <filter-panel level="dataset"></filter-panel>

        <div>
          <el-form :inline="true" style="display: inline-flex">
            <el-radio-group v-model="displayMode" size="small">
              <el-radio-button label="List"></el-radio-button>
              <el-radio-button label="Summary"></el-radio-button>
            </el-radio-group>

            <el-checkbox-group v-model="categories" :min=1 style="padding: 5px 20px;"
                               v-if="displayMode == 'List'">
              <el-checkbox class="cb-started" label="started">Processing {{ count('started') }}</el-checkbox>
              <el-checkbox class="cb-queued" label="queued">Queued {{ count('queued') }}</el-checkbox>
              <el-checkbox label="finished">Finished {{ count('finished') }}</el-checkbox>
            </el-checkbox-group>
          </el-form>
        </div>

        <div v-if="displayMode == 'List'">
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

          <div class="dataset-list">
            <dataset-item v-for="(dataset, i) in datasets"
                          :dataset="dataset" :key="dataset.id"
                          :class="[i%2 ? 'even': 'odd']">
            </dataset-item>
          </div>
        </div>

        <div v-else>
          <mass-spec-setup-plot></mass-spec-setup-plot>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
 import {datasetListQuery, datasetCountQuery} from '../api/dataset';
 import DatasetItem from './DatasetItem.vue';
 import FilterPanel from './FilterPanel.vue';
 import MassSpecSetupPlot from './plots/MSSetupSummaryPlot.vue';
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
     FilterPanel,
     MassSpecSetupPlot
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
     },

     displayMode: {
       get() {
         return this.$store.getters.settings.datasets.tab;
       },
       set(value) {
         this.$store.commit('setCurrentTab', value);
       }
     }
   },

   apollo: {
     $subscribe: {
       datasetDeleted: {
         query: gql`subscription DD {
           datasetDeleted { datasetId }
         }`,
         result(data) {
           console.log(data);
           this.refetchList();
         }
       },

       datasetStatusUpdated: {
         query: gql`subscription DS {
           datasetStatusUpdated {
             dataset {
               id
               name
               status
               submitter {
                 name
                 surname
               }
               institution
             }
           }
         }`,
         result(data) {
           console.log(data);
           const {
             id, name, status, submitter, institution
           } = data.datasetStatusUpdated.dataset;
           const who = `${submitter.name} ${submitter.surname} (${institution})`;
           const statusMap = {
             FINISHED: 'success',
             QUEUED: 'info',
             STARTED: 'info',
             FAILED: 'warning'
           };
           let message = '';
           if (status == 'FINISHED')
             message = `Processing of dataset ${name} is finished!`;
           else if (status == 'FAILED')
             message = `Something went wrong with dataset ${name} :(`;
           else if (status == 'QUEUED')
             message = `Dataset ${name} has been submitted by ${who}`;
           else if (status == 'STARTED')
             message = `Started processing dataset ${name}`;
           this.$notify({ message, type: statusMap[status] });

           this.refetchList();
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
                                  this.$store.getters.gqlDatasetFilter),
           query: this.$store.getters.ftsQuery
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
                                  this.$store.getters.gqlDatasetFilter),
           query: this.$store.getters.ftsQuery
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
                                  this.$store.getters.gqlDatasetFilter),
           query: this.$store.getters.ftsQuery
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
                                  this.$store.getters.gqlDatasetFilter),
           query: this.$store.getters.ftsQuery
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
       // assume not too many items are queued/being processed
       // so they are all visible in the web app
       return '(' + this[stage].length + ')';
     },

     refetchList() {
       this.$apollo.queries.started.refresh();
       this.$apollo.queries.queued.refresh();
       this.$apollo.queries.finished.refresh();
       this.$apollo.queries.finishedCount.refresh();
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
