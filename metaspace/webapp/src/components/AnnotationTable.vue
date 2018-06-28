<template>
  <el-row>
    <el-table id="annot-table"
              ref="table"
              :data="annotations"
              size="mini"
              border
              v-loading="isLoading"
              element-loading-text="Loading results from the server..."
              highlight-current-row
              width="100%"
              stripe
              tabindex="1"
              :default-sort="getDefaultSort"
              :row-class-name="getRowClass"
              @keyup.native="onKeyUp"
              @keydown.native="onKeyDown"
              @current-change="onCurrentRowChange"
              @sort-change="onSortChange">

      <p slot="empty" v-if="singleDatasetSelected && filter.fdrLevel <= 0.2 && ((filter.minMSM || 0) <= 0.2)"
         style="text-align: left;">
        No annotations were found for this dataset at {{ filter.fdrLevel * 100 }}% FDR. This might be because of:
        <ul>
          <li>Incorrect database setting</li>
          <li>Calibration issues</li>
          <li>Wrong polarity provided during upload</li>
        </ul>

        Please:
        <ul>
          <li>Select another database <br/>(HMDB is always applicable)</li>
          <li>Relax the FDR filter</li>
          <li>Look for missing pixels/stripes: <br/>these indicate calibration issues</li>
        </ul>
      </p>

      <p slot="empty" v-else>
        No annotations were found
      </p>

      <el-table-column label="Lab" v-if="!hidden('Institution')"
                       min-width="95">
        <template slot-scope="props">
          <div class="cell-wrapper">
            <span class="cell-span">
              {{ props.row.dataset.institution }}
            </span>
            <img src="../assets/filter-icon.png"
                 @click="filterInstitution(props.row)"
                 title="Limit results to this lab"/>
          </div>
        </template>
      </el-table-column>

      <el-table-column property="dataset.name"
                       label="Dataset" v-if="!hidden('Dataset')"
                       min-width="140">
        <template slot-scope="props">
          <div class="cell-wrapper">
              <span class="cell-span">
                  {{ formatDatasetName(props.row) }}
              </span>
              <img src="../assets/filter-icon.png"
                   @click="filterDataset(props.row)"
                   title="Limit results to this dataset"/>
          </div>
        </template>
      </el-table-column>

      <el-table-column property="sumFormula"
                       label="Annotation"
                       sortable="custom"
                       min-width="120">
        <template slot-scope="props">
        <el-popover trigger="hover" placement="right">
            <div>Candidate molecules ({{ props.row.possibleCompounds.length }}):
                <ul>
                    <li v-for="comp in props.row.possibleCompounds">
                        {{ comp.name }}
                    </li>
                </ul>
            </div>

            <div slot="reference" class="cell-wrapper">
                <span class="sf cell-span"
                      v-html="renderMolFormula(props.row.sumFormula, props.row.adduct, props.row.dataset.polarity)"></span>
                <img src="../assets/filter-icon.png"
                     v-if="!filter.compoundName"
                     @click="filterMolFormula(props.row)"
                     title="Limit results to this molecular formula"/>
            </div>
        </el-popover>
        </template>
      </el-table-column>

      <el-table-column property="mz"
                       label="m/z"
                       sortable="custom"
                       min-width="65">
        <template slot-scope="props">
          <div class="cell-wrapper">
              <span class="cell-span">
                  {{ formatMZ(props.row) }}
              </span>
              <img src="../assets/filter-icon.png"
                   @click="filterMZ(props.row)"
                   title="Limit results to this m/z (with 5 ppm tolerance)"/>
          </div>
        </template>
      </el-table-column>

      <el-table-column property="msmScore"
                       label="MSM"
                       sortable="custom"
                       :formatter="formatMSM"
                       min-width="60">
      </el-table-column>

      <el-table-column property="fdrLevel"
                       label="FDR"
                       class-name="fdr-cell"
                       sortable="custom"
                       min-width="40">
        <template slot-scope="props">
          <span class="fdr-span"> {{props.row.fdrLevel * 100}}% </span>
        </template>
      </el-table-column>

    </el-table>

    <div id="annot-table-controls">
      <div>
        <el-pagination :total="totalCount"
                       :page-size="recordsPerPage"
                       @size-change="onPageSizeChange"
                       :page-sizes="pageSizes"
                       :current-page="currentPage + 1"
                       @current-change="onPageChange"
                       :layout="paginationLayout">
        </el-pagination>

        <div id="annot-count">
          <b>{{ totalCount }}</b> matching {{ totalCount == 1 ? 'record': 'records' }}
        </div>

        <div style="padding-top: 10px;">
          <div class="fdr-legend-header">FDR levels: </div>
          <div class="fdr-legend fdr-5">5%</div>
          <div class="fdr-legend fdr-10">10%</div>
          <div class="fdr-legend fdr-20">20%</div>
          <div class="fdr-legend fdr-50">50%</div>
        </div>
      </div>

      <div>
        <progress-button v-if="isExporting && totalCount > 5000" @click="abortExport"
                         class="export-btn"
                         :width=150 :height=36
                         :percentage="exportProgress * 100">
          Cancel
        </progress-button>

        <el-button v-else class="export-btn" @click="startExport"
                   :disabled="isExporting">
          Export to CSV
        </el-button>
      </div>
    </div>
  </el-row>
</template>

<script>
 import { renderMolFormula, csvExportHeader } from '../util';
 import ProgressButton from './ProgressButton.vue';
 import {
   annotationListQuery,
   tableExportQuery
 } from '../api/annotation';

 import Vue from 'vue';
 import FileSaver from 'file-saver';

 // 38 = up, 40 = down, 74 = j, 75 = k
 const KEY_TO_ACTION = {38: 'up', 75: 'up', 40: 'down', 74: 'down'};

 export default {
   name: 'annotation-table',
   props: ["hideColumns"],
   components: {ProgressButton},
   data () {
     return {
       annotations: [],
       recordsPerPage: 15,
       greenCount: 0,
       pageSizes: [15, 20, 25, 30],
       isExporting: false,
       exportProgress: 0,
       totalCount: 0
     }
   },
   mounted() {
     var nCells = (window.innerHeight - 150) / 43;
     var pageSizes = this.pageSizes.filter(n => nCells >= n).slice(-1);
     if (pageSizes.length > 0) {
       this.recordsPerPage = pageSizes[0];
     }
   },
   computed: {
     isLoading() {
       return this.$store.state.tableIsLoading;
     },

     filter() {
       return this.$store.getters.filter;
     },

     singleDatasetSelected() {
       let isSimple = true;
       for (var key in this.filter) {
         if (!this.filter[key])
           continue;
         if (['fdrLevel', 'minMSM', 'database', 'datasetIds'].indexOf(key) == -1) {
           isSimple = false;
           break;
         }
       }
       return isSimple && this.filter.datasetIds && this.filter.datasetIds.length == 1;
     },

     orderBy() {
       return this.$store.getters.settings.table.order.by;
     },

     sortingOrder() {
       return this.$store.getters.settings.table.order.dir;
     },

     getDefaultSort() {
       let by = this.orderBy,
           order = this.sortingOrder.toLowerCase(),
           prop = 'msmScore';
       if (by == 'ORDER_BY_MZ')
         prop = 'mz';
       else if (by == 'ORDER_BY_MSM')
         prop = 'msmScore';
       else if (by == 'ORDER_BY_FDR_MSM')
         prop = 'fdrLevel';
       return {prop, order};
     },

     numberOfPages () {
       return Math.ceil(this.totalCount / this.recordsPerPage);
     },

     gqlFilter () {
       return {
         annotationFilter: this.$store.getters.gqlAnnotationFilter,
         datasetFilter: this.$store.getters.gqlDatasetFilter,
         ftsQuery: this.$store.getters.ftsQuery
       };
     },

     currentPage () {
       return this.$store.getters.settings.table.currentPage;
     },

     paginationLayout() {
       const {datasetIds} = this.filter,
             limitedSpace = datasetIds && datasetIds.length == 1;
       if (limitedSpace)
         return "pager";

       return "prev,pager,next,sizes";
     }
   },
   apollo: {
     annotations: {
       query: annotationListQuery,
       variables() {
         return this.queryVariables();
       },
       update: data => data.allAnnotations,
       debounce: 200,
       result ({data}) {
         // For whatever reason (could be a bug), vue-apollo seems to first refetch
         // data for the current page and only then fetch the updated data.
         // Checking if the data has been actually changed is easiest by comparing
         // string representations of old and newly arrived data.
         const changed = JSON.stringify(data) != this._prevData;
         this._prevData = JSON.stringify(data);

         // Handle page changes (due to pagination or keyboard events).
         // On data arrival we need to highlight the current row if the change
         // was because of an up/down key press, and disable all highlighting
         // if it was due to a click on a pagination button.
         if (this._onDataArrival && changed) {
           this._onDataArrival(data.allAnnotations);
           this._onDataArrival = (data) => {
             this.clearCurrentRow();
             if (data)
               Vue.nextTick(() => this.setRow(data, 0));
           };
         }

         this.totalCount = data.countAnnotations;
       },
       watchLoading (isLoading) {
         this.$store.commit('updateAnnotationTableStatus', isLoading);
       }
     }
   },
   created() {
     this._onDataArrival = (data) => {
       if (!data) return;
       Vue.nextTick(() => this.setRow(data, 0));
       document.getElementById('annot-table').focus();
     };
   },
   methods: {
     onPageSizeChange(newSize) {
       this.recordsPerPage = newSize;
     },
     setRow(data, rowIndex) {
       this.$refs.table.setCurrentRow(null);
       this.$refs.table.setCurrentRow(data[rowIndex]);
     },
     queryVariables() {
       const {annotationFilter, datasetFilter, ftsQuery} = this.gqlFilter;

       return {
         filter: annotationFilter,
         dFilter: datasetFilter,
         query: ftsQuery,
         orderBy: this.orderBy,
         sortingOrder: this.sortingOrder,
         offset: this.currentPage * this.recordsPerPage,
         limit: this.recordsPerPage
       };
     },

     hidden (columnLabel) {
       return this.hideColumns.indexOf(columnLabel) >= 0;
     },

     renderMolFormula,
     getRowClass ({row}) {
       if (row.fdrLevel <= 0.051)
         return 'fdr-5';
       else if (row.fdrLevel <= 0.101)
         return 'fdr-10';
       else if (row.fdrLevel <= 0.201)
         return 'fdr-20';
       else
         return 'fdr-50';
     },
     formatMSM: (row, col) => row.msmScore.toFixed(3),
     formatMZ: (row, col) => row.mz.toFixed(4),
     formatDatasetName: (row, col) => row.dataset.name,

     onSortChange (event) {
       if (!event.order) {
         return;
       }

       this.clearCurrentRow();

       let orderBy = this.orderBy;
       if (event.prop == 'msmScore')
         orderBy = 'ORDER_BY_MSM';
       else if (event.prop == 'mz')
         orderBy = 'ORDER_BY_MZ';
       else if (event.prop == 'fdrLevel')
         orderBy = 'ORDER_BY_FDR_MSM';
       else if (event.prop == 'sumFormula')
         orderBy = 'ORDER_BY_FORMULA';
       this.$store.commit('setSortOrder', {
         by: orderBy, dir: event.order.toUpperCase()
       });
     },

     setPage (page) {
       this.$store.commit('setCurrentPage', page);
     },

     onPageChange (page) {
       this.setPage(page - 1);
     },

     onCurrentRowChange (row) {
       if (row)
         this.$store.commit('setAnnotation', row);
     },

     onKeyDown (event) {
       const action = KEY_TO_ACTION[event.keyCode];
       if (action) {
         event.preventDefault();
         return false;
       }
       return true;
     },

     onKeyUp (event) {
       const action = KEY_TO_ACTION[event.keyCode];
       if (!action)
         return;

       // WARNING the code below relies on internals of el-table:
       // store.{states.currentRow, mutations.{setData, setCurrentRow}}
       const tblStore = this.$refs.table.store;
       const curRow = tblStore.states.currentRow;
       const curIdx = this.annotations.indexOf(curRow);

       if (action == 'up' && curIdx == 0) {
         if (this.currentPage == 0)
           return;
         this._onDataArrival = data => { Vue.nextTick(() => this.setRow(data, data.length - 1)); };
         this.setPage(this.currentPage - 1);
         return;
       }

       if (action == 'down' && curIdx == this.annotations.length - 1) {
         if (this.currentPage == this.numberOfPages - 1)
           return;
         this._onDataArrival = data => { Vue.nextTick(() => this.setRow(data, 0)); };
         this.setPage(this.currentPage + 1);
         return;
       }

       const delta = action == 'up' ? -1 : +1;
       tblStore.commit('setCurrentRow',
                       this.annotations[curIdx + delta]);
     },

     clearCurrentRow () {
       var currentRow = document.querySelector('.current-row');
       if (currentRow)
         currentRow.classList.remove('current-row');
       // filed a bug: https://github.com/ElemeFE/element/issues/1890
       // TODO check if it's really fixed
     },

     updateFilter (delta) {
       let filter = Object.assign({}, this.filter, delta);
       this.$store.commit('updateFilter', filter);
     },

     filterInstitution (row) {
       this.updateFilter({institution: row.dataset.institution});
     },

     filterDataset (row) {
       this.updateFilter({datasetIds: [row.dataset.id]});
     },

     filterMolFormula (row) {
       this.updateFilter({compoundName: row.sumFormula});
     },

     filterMZ (row) {
       this.updateFilter({mz: row.mz});
     },

     startExport () {
       const chunkSize = 1000;
       let csv = csvExportHeader();

       csv += ['institution', 'datasetName', 'datasetId', 'formula', 'adduct', 'mz',
               'msm', 'fdr', 'rhoSpatial', 'rhoSpectral', 'rhoChaos',
               'moleculeNames', 'moleculeIds'].join(',') + "\n";

       function quoted(s) { return '"' + s + '"'; }

       function databaseId(compound) {
         return compound.information[0].databaseId;
       }

       function formatRow(row) {
         const {sumFormula, adduct, msmScore, mz,
                rhoSpatial, rhoSpectral, rhoChaos, fdrLevel} = row;
         return [
           row.dataset.institution, row.dataset.name, row.dataset.id,
           sumFormula, quoted("M" + adduct), mz,
           msmScore, fdrLevel, rhoSpatial, rhoSpectral, rhoChaos,
           quoted(row.possibleCompounds.map(m => m.name).join(', ')),
           quoted(row.possibleCompounds.map(databaseId).join(', '))
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
         self.exportProgress = 0;

         let blob = new Blob([csv], {type: 'text/csv; charset="utf-8"'});
         FileSaver.saveAs(blob, "metaspace_annotations.csv");
       }

       let v = this.queryVariables(),
           chunks = [],
           offset = 0;

       v.limit = chunkSize;

       function runExport() {
         const variables = Object.assign(v, {offset});
         self.$apollo.query({query: tableExportQuery, variables})
             .then(resp => {
           self.exportProgress = offset / self.totalCount;
           offset += chunkSize;
           writeCsvChunk(resp.data.annotations);
           if (!self.isExporting || offset >= self.totalCount) {
             finish();
           } else {
             window.setTimeout(runExport, 50);
           }
         })
       }

       runExport();
     },

     abortExport() {
       this.isExporting = false;
       this.exportProgress = 0;
     }
   }
 }
</script>

<style>

 #annot-table {
   border: 0px;
   font-family: 'Roboto', sans-serif;
 }

 /* fix cell height and align text in the center */
 #annot-table .cell {
   height: 24px;
   display: flex;
   align-items: center;
   padding: 0 0 0 10px;
 }

 #annot-table th > .cell{
   height: 30px;
   font-size: 14px;
 }

 /* don't show long institution/dataset names */
 #annot-table .cell {
   white-space: nowrap;
 }

 #annot-table::after {
   background-color: transparent;
 }

 .el-table__body tr.fdr-5 > td.fdr-cell, .fdr-legend.fdr-5 {
   background-color: #c8ffc8;
 }

.el-table__body tr.fdr-10 > td.fdr-cell, .fdr-legend.fdr-10 {
   background-color: #e0ffe0;
 }

.el-table__body tr.fdr-20 > td.fdr-cell, .fdr-legend.fdr-20 {
   background-color: #ffe;
 }

 .el-table__body tr.fdr-50 > td.fdr-cell, .fdr-legend.fdr-50 {
   background-color: #fff5e0;
 }

 .el-table__body tr.fdr-5.current-row > td {
   background-color: #8f8 !important;
 }

 .el-table__body tr.fdr-10.current-row > td {
   background-color: #bfb !important;
 }

 .el-table__body tr.fdr-20.current-row > td {
   background-color: #ffa !important;
 }

 .el-table__body tr.fdr-50.current-row > td {
   background-color: #ffe5a0 !important;
 }

 .cell-wrapper {
   width: 100%;
   display: flex;
   justify-content: space-between;
 }

 .cell-span {
   width: 80%;
 }

 .cell-wrapper img {
   /*
      don't use display:none because of a TestCafe bug:
      https://github.com/DevExpress/testcafe/issues/1426
   */
   opacity: 0;
   max-height: 20px;
   max-width: 20%;
 }

 .cell-wrapper:hover img {
   display: inherit;
   cursor: pointer;
   opacity: 1;
 }

 .fdr-legend, .fdr-legend-header {
   padding: 5px;
   margin: 0px 0px 10px 0px;
   display: inline-block;
   float: left;
   text-align: center;
 }

 .fdr-legend.fdr-5 {
   border-radius: 5px 0px 0px 5px;
 }

 .fdr-legend.fdr-50 {
   border-radius: 0px 5px 5px 0px;
 }

 #annot-table th.fdr-cell > .cell {
   padding: 0;
 }

 .fdr-cell > .cell {
   justify-content: center;
 }

 .fdr-span {
   padding-right: 6px;
 }

 .el-table__empty-block {
   min-height: 300px;
 }

 #annot-table > .el-loading-mask {
   background-color: white;
 }

 .export-btn {
   margin-top: 7px;
   width: 135px;
   height: 36px;
 }

 #annot-table-controls {
   display: flex;
   flex-direction: row;
   justify-content: space-between;
 }

 #annot-count {
   padding: 10px 0 0 5px;
 }
</style>
