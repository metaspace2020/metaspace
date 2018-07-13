<template>
  <div>
    <filter-panel level="dataset"></filter-panel>

    <div>
      <el-form :inline="true" style="display: inline-flex">
        <el-radio-group value="List" @input="onChangeTab" size="small">
          <el-radio-button label="List"></el-radio-button>
          <el-radio-button label="Summary"></el-radio-button>
        </el-radio-group>

        <el-checkbox-group v-model="categories" :min=1 style="padding: 5px 20px;">
          <el-checkbox class="cb-started" label="started">Processing {{ count('started') }}</el-checkbox>
          <el-checkbox class="cb-queued" label="queued">Queued {{ count('queued') }}</el-checkbox>
          <el-checkbox label="finished">Finished {{ count('finished') }}</el-checkbox>
        </el-checkbox-group>
      </el-form>
    </div>

    <div>
      <div id="dataset-list-header">
        <div v-if="noFilters" style="font: 24px 'Roboto', sans-serif; padding: 5px;">
          <span v-if="noFilters">
            Recent uploads
          </span>
        </div>

        <div v-else style="font: 18px 'Roboto', sans-serif; padding: 5px;">
          <span v-if="nonEmpty">
            Search results in reverse chronological order
          </span>
          <span v-else>No datasets found</span>
        </div>

        <el-button v-if="nonEmpty" :disabled="isExporting" @click="startExport" class="export-btn">
          Export to CSV
        </el-button>
      </div>

      <div class="dataset-list">
        <dataset-item v-for="(dataset, i) in datasets"
                      :dataset="dataset" :key="dataset.id"
                      :class="[i%2 ? 'even': 'odd']">
        </dataset-item>
      </div>
    </div>
  </div>
</template>

<script>
 import {datasetListQuery, datasetCountQuery} from '../api/dataset';
 import {metadataExportQuery} from '../api/metadata';
 import DatasetItem from './DatasetItem.vue';
 import FilterPanel from './FilterPanel.vue';
 import {csvExportHeader} from '../util';
 import gql from 'graphql-tag';
 import FileSaver from 'file-saver';

 const processingStages = ['started', 'queued', 'finished'];

 export default {
   name: 'dataset-table',
   data () {
     return {
       currentPage: 0,
       recordsPerPage: 10,
       categories: processingStages,
       isExporting: false
     }
   },
   components: {
     DatasetItem,
     FilterPanel,
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
   },

   apollo: {
     $subscribe: {
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
           if (data.datasetStatusUpdated.dataset != null) {
             const {name, status, submitter, institution} = data.datasetStatusUpdated.dataset;
             const who = `${submitter.name} ${submitter.surname} (${institution})`;
             const statusMap = {
               FINISHED: 'success',
               QUEUED: 'info',
               ANNOTATING: 'info',
               FAILED: 'warning'
             };
             let message = '';
             if (status == 'FINISHED')
               message = `Processing of dataset ${name} is finished!`;
             else if (status == 'FAILED')
               message = `Something went wrong with dataset ${name} :(`;
             else if (status == 'QUEUED')
               message = `Dataset ${name} has been submitted to query by ${who}`;
             else if (status == 'ANNOTATING')
               message = `Started processing dataset ${name}`;
             this.$notify({ message, type: statusMap[status] });
           }

           this.refetchList();
         }
       }
     },

     started: {
       fetchPolicy: 'cache-and-network',
       query: datasetListQuery,
       update: data => data.allDatasets,
       variables () {
         return this.queryVariables('ANNOTATING');
       }
     },

     queued: {
       fetchPolicy: 'cache-and-network',
       query: datasetListQuery,
       update: data => data.allDatasets,
       variables () {
         return this.queryVariables('QUEUED');
       }
     },

     finished: {
       fetchPolicy: 'cache-and-network',
       query: datasetListQuery,
       update: data => data.allDatasets,
       variables () {
         return this.queryVariables('FINISHED');
       }
     },

     finishedCount: {
       fetchPolicy: 'cache-and-network',
       query: datasetCountQuery,
       update: data => data.countDatasets,
       variables () {
         return this.queryVariables('FINISHED');
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

     queryVariables(status) {
       let body = {
         dFilter: Object.assign({status}, this.$store.getters.gqlDatasetFilter),
         query: this.$store.getters.ftsQuery,
         inpFdrLvls: [],
         checkLvl: 10
       };
       if (status === 'FINISHED') {body['inpFdrLvls'] = [10]};
       return body
     },

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
     },

     startExport() {
       const chunkSize = 1000;

       let csv = csvExportHeader();

       csv += ['datasetId', 'datasetName', 'institution', 'submitter',
               'PI', 'organism', 'organismPart', 'condition', 'growthConditions', 'ionisationSource',
               'maldiMatrix', 'analyzer', 'resPower400', 'polarity', 'uploadDateTime','FDR@10% + DataBase', 'opticalImage'
       ].join(',') + "\n";

       function person(p) { return p ? p.name + ' ' + p.surname : ''; }

       function formatRow(row) {
         return [
           row.id,
           row.name,
           row.institution,
           person(row.submitter),
           person(row.principalInvestigator),
           row.organism,
           row.organismPart,
           row.condition,
           row.growthConditions,
           row.ionisationSource,
           row.maldiMatrix,
           row.analyzer.type,
           Math.round(row.analyzer.resolvingPower),
           row.polarity.toLowerCase(),
           row.uploadDateTime,
           row.fdrCounts ? `${row.fdrCounts.counts}` + ' ' + `${row.fdrCounts.dbName}` : '',
           (row.opticalImage != 'noOptImage') ? 'http://' + window.location.host + row.opticalImage : 'No optical image'
         ].join(',');
       }

       function writeCsvChunk(rows) {
         for (let row of rows) {
           csv += formatRow(row) + "\n";
         }
       }

       this.isExporting = true;
       let self = this;

       function finish() {
         if (!self.isExporting)
           return;

         self.isExporting = false;

         let blob = new Blob([csv], {type: 'text/csv; charset="utf-8"'});
         FileSaver.saveAs(blob, "metaspace_datasets.csv");
       }

       let v = this.queryVariables('FINISHED'),
           chunks = [],
           offset = 0;

       v.limit = chunkSize;

       function runExport() {
         const variables = Object.assign(v, {offset});
         self.$apollo.query({query: metadataExportQuery, variables})
             .then(resp => {
           offset += chunkSize;
           writeCsvChunk(resp.data.datasets);
           if (!self.isExporting || offset >= self.finishedCount) {
             finish();
           } else {
             window.setTimeout(runExport, 50);
           }
         })
       }

       runExport();
     },

     onChangeTab(tab) {
       this.$store.commit('setDatasetTab', tab);
     }
   }
 }
</script>

<style lang="scss">

 #dataset-page {
   display: flex;
   justify-content: center;
 }

 /* 1 dataset per row by default*/
 #dataset-page-contents {
   display: inline-block;
   width: 820px;

   @media (min-width: 1650px) {
     /* 2 datasets per row on wide screens */
     width: 1620px;
   }
 }

 .even {
   background-color: #e6f1ff;

   @media (min-width: 1650px) {
     background-color: white;
   }
 }

 .odd {
   background-color: white;
 }

 .dataset-list {
   display: flex;
   flex-direction: row;
   flex-wrap: wrap;
   align-items: stretch;
 }

 .export-btn {
   margin-top: 7px;
   width: 135px;
   height: 36px;
 }

 .cb-started .el-checkbox__input.is-checked .el-checkbox__inner {
   background: #5eed5e;
 }

 .cb-queued .el-checkbox__input.is-checked .el-checkbox__inner {
   background: #72c8e5;
 }

 #dataset-list-header {
   display: flex;
   align-items: baseline;
 }
</style>
