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
          <el-checkbox v-if="canSeeFailed" class="cb-failed" label="failed">Failed {{ count('failed') }}</el-checkbox>
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

      <dataset-list :datasets="datasets" allowDoubleColumn />
    </div>
  </div>
</template>

<script>
  import {
    datasetDetailItemsQuery,
    datasetCountQuery,
    datasetDeletedQuery,
    datasetStatusUpdatedQuery,
  } from '../../../api/dataset';
 import {metadataExportQuery} from '../../../api/metadata';
 import DatasetList from './DatasetList.vue';
 import {FilterPanel} from '../../Filters/index';
 import { csvExportHeader } from '../../../util';
 import FileSaver from 'file-saver';
 import delay from '../../../lib/delay';
 import formatCsvRow from '../../../lib/formatCsvRow';
  import {currentUserRoleQuery} from '../../../api/user';
  import {removeDatasetFromAllDatasetsQuery} from '../../../lib/updateApolloCache';
  import {sortBy, uniqBy} from 'lodash-es';
  import updateApolloCache from '../../../lib/updateApolloCache';

 const processingStages = ['started', 'queued', 'failed', 'finished'];

 export default {
   name: 'dataset-table',
   data () {
     return {
       recordsPerPage: 10,
       csvChunkSize: 1000,
       categories: ['started', 'queued', 'finished'],
       isExporting: false
     }
   },
   components: {
     DatasetList,
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

     allDatasets() {
       let list = [];
       for (let category of processingStages) {
         if (this[category]) {
           list = list.concat(this[category]);
         }
       }
       // Sort again in case any datasets have had their status changed and are now in the wrong list
       const sortOrder = ['FAILED', 'ANNOTATING', 'QUEUED', 'FINISHED'];
       list = uniqBy(list, 'id');
       list = sortBy(list, dataset => sortOrder.indexOf(dataset.status));
       return list;

     },

     datasets() {
       return this.allDatasets
         .filter(ds =>
           (ds.status === 'FAILED' && this.categories.includes('failed'))
           || (ds.status === 'ANNOTATING' && this.categories.includes('started'))
           || (ds.status === 'QUEUED' && this.categories.includes('queued'))
           || (ds.status === 'FINISHED' && this.categories.includes('finished')));
     },

     canSeeFailed() {
       return this.currentUser != null && this.currentUser.role === 'admin';
     }
   },

   apollo: {
     $subscribe: {
       datasetDeleted: {
         query: datasetDeletedQuery,
         result({data}) {
           const datasetId = data.datasetDeleted.id;
           ['failed', 'finished', 'queued', 'started'].forEach(queryName => {
             removeDatasetFromAllDatasetsQuery(this, queryName, datasetId);
           });
         }
       },
       datasetStatusUpdated: {
         query: datasetStatusUpdatedQuery,
         async result({ data }) {
           const { dataset, action, stage, is_new } = data.datasetStatusUpdated;
           if (dataset != null && action === 'ANNOTATE' && stage === 'QUEUED' && is_new) {
             updateApolloCache(this, 'queued', oldVal => {
               return {
                 ...oldVal,
                 allDatasets: oldVal.allDatasets && [dataset, ...oldVal.allDatasets],
               };
             });
           }
         }
       },
     },

     currentUser: {
       query: currentUserRoleQuery,
       fetchPolicy: 'cache-first',
     },

     failed: {
       fetchPolicy: 'cache-and-network',
       query: datasetDetailItemsQuery,
       update: data => data.allDatasets,
       skip() {
         return !this.canSeeFailed;
       },
       variables () {
         return this.queryVariables('FAILED');
       }
     },

     started: {
       fetchPolicy: 'cache-and-network',
       query: datasetDetailItemsQuery,
       update: data => data.allDatasets,
       variables () {
         return this.queryVariables('ANNOTATING');
       }
     },

     queued: {
       fetchPolicy: 'cache-and-network',
       query: datasetDetailItemsQuery,
       update: data => data.allDatasets,
       variables () {
         return this.queryVariables('QUEUED');
       }
     },

     finished: {
       fetchPolicy: 'cache-and-network',
       query: datasetDetailItemsQuery,
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
       row.submitter.name,
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
       let count = null;
       // assume not too many items are failed/queued/annotating so they are all visible in the web app,
       // but check all lists because they may be in the wrong list due to status updates after they were loaded
       if (stage === 'failed')
         count = this.allDatasets.filter(ds => ds.status === 'FAILED').length;
       if (stage === 'queued')
         count = this.allDatasets.filter(ds => ds.status === 'QUEUED').length;
       if (stage === 'started')
         count = this.allDatasets.filter(ds => ds.status === 'ANNOTATING').length;
       if (stage === 'finished') {
         const inOtherLists = this.allDatasets.filter(ds => ds.status === 'FINISHED').length
           - (this.finished && this.finished.length || 0);
         count = this.finishedCount == null ? null : this.finishedCount + inOtherLists;
       }

       return count != null && !isNaN(count) ? `(${count})` : '';
     },

     async startExport() {
       let csv = csvExportHeader();

       csv += formatCsvRow(['datasetId', 'datasetName', 'group', 'submitter',
               'PI', 'organism', 'organismPart', 'condition', 'growthConditions', 'ionisationSource',
               'maldiMatrix', 'analyzer', 'resPower400', 'polarity', 'uploadDateTime','FDR@10% + DataBase', 'opticalImage'
       ]);

       function person(p) { return p ? p.name : ''; }

       function formatRow(row) {
         return formatCsvRow([
           row.id,
           row.name,
           row.groupApproved && row.group ? row.group.shortName : '',
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
           (row.rawOpticalImageUrl) ? window.location.origin + row.rawOpticalImageUrl : 'No optical image'
         ]);
       }

       function writeCsvChunk(rows) {
         for (let row of rows) {
           csv += formatRow(row);
         }
       }

       this.isExporting = true;
       let self = this;

       let v = this.queryVariables('FINISHED'),
           chunks = [],
           offset = 0;

       v.limit = this.csvChunkSize;

       while (self.isExporting && offset < self.finishedCount) {
         const variables = Object.assign(v, {offset});
         const resp = await self.$apollo.query({query: metadataExportQuery, variables});

         offset += this.csvChunkSize;
         writeCsvChunk(resp.data.datasets);
         await delay(50);
       }

       if (!self.isExporting)
         return;

       self.isExporting = false;

       let blob = new Blob([csv], {type: 'text/csv; charset="utf-8"'});
       FileSaver.saveAs(blob, "metaspace_datasets.csv");
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

 .cb-failed .el-checkbox__input.is-checked .el-checkbox__inner {
   background: #f56c6c;
 }

 #dataset-list-header {
   display: flex;
   align-items: baseline;
 }
</style>
