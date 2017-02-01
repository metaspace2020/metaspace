<template>
  <el-row>
    <el-table id="annot-table"
              ref="table"
              :data="annotations"
              border
              v-loading="isLoading"
              element-loading-text="Loading results from the server..."
              highlight-current-row
              width="100%"
              stripe
              tabindex="1"
              default-sort-order="descending"
              default-sort-prop="msmScore"
              :row-class-name="getRowClass"
              @keyup.native="onKeyUp"
              @keydown.native="onKeyDown"
              @current-change="onCurrentRowChange"
              @sort-change="onSortChange">

      <el-table-column inline-template
                       label="Institution" v-if="!hidden('Institution')"
                       min-width="95">
        <div class="cell-wrapper">
          <span class="cell-span">
            {{ row.dataset.institution }}
          </span>
          <img src="../assets/filter-icon.png"
               @click="filterInstitution(row)"
               title="Limit results to this institution"/>
        </div>
      </el-table-column>

      <el-table-column inline-template
                       property="dataset.name"
                       label="Dataset" v-if="!hidden('Dataset')"
                       min-width="140">
          <div class="cell-wrapper">
              <span class="cell-span">
                  {{ formatDatasetName(row) }}
              </span>
              <img src="../assets/filter-icon.png"
                   @click="filterDataset(row)"
                   title="Limit results to this dataset"/>
          </div>
      </el-table-column>

      <el-table-column inline-template
                       label="Annotation"
                       min-width="120">
        <el-popover trigger="hover" placement="left">
            <div>Candidate compounds ({{ row.possibleCompounds.length }}):
                <ul>
                    <li v-for="comp in row.possibleCompounds">
                        {{ comp.name }}
                    </li>
                </ul>
            </div>

            <div slot="reference" class="cell-wrapper">
                <span class="sf cell-span"
                      v-html="renderSumFormula(row.sumFormula, row.adduct, row.dataset.polarity)"></span>
                <img src="../assets/filter-icon.png"
                     v-if="!filter.compoundName"
                     @click="filterSumFormula(row)"
                     title="Limit results to this sum formula"/>
            </div>
        </el-popover>
      </el-table-column>

      <el-table-column inline-template
                       property="mz"
                       label="m/z"
                       sortable
                       min-width="65">
          <div class="cell-wrapper">
              <span class="cell-span">
                  {{ formatMZ(row) }}
              </span>
              <img src="../assets/filter-icon.png"
                   @click="filterMZ(row)"
                   title="Limit results to this m/z (with 5 ppm tolerance)"/>
          </div>
      </el-table-column>

      <el-table-column property="msmScore"
                       label="MSM"
                       sortable
                       :formatter="formatMSM"
                       min-width="60">
      </el-table-column>

      <el-table-column inline-template property="fdrLevel"
                       label="FDR"
                       class-name="fdr-cell"
                       sortable
                       min-width="40">
        <span class="fdr-span"> {{row.fdrLevel * 100}}% </span>
      </el-table-column>

    </el-table>

    <el-pagination :total="totalCount"
                   :page-size="recordsPerPage"
                   @size-change="onPageSizeChange"
                   :page-sizes="pageSizes"
                   :current-page="currentPage + 1"
                   @current-change="onPageChange"
                   layout="prev,pager,next,sizes">
    </el-pagination>

    <div style="padding: 10px 0 0 5px;">
      <b>{{ totalCount }}</b> matching {{ totalCount == 1 ? 'record': 'records' }}
    </div>

    <div style="padding-top: 10px; display: flex;">
      <div class="fdr-legend-header">FDR levels: </div>
      <div class="fdr-legend fdr-5">5%</div>
      <div class="fdr-legend fdr-10">10%</div>
      <div class="fdr-legend fdr-20">20%</div>
      <div class="fdr-legend fdr-50">50%</div>
    </div>
  </el-row>
</template>

<script>
 import gql from 'graphql-tag';
 import { renderSumFormula } from '../util.js';
 import Vue from 'vue';

 // 38 = up, 40 = down, 74 = j, 75 = k
 const KEY_TO_ACTION = {38: 'up', 75: 'up', 40: 'down', 74: 'down'};

 export default {
   name: 'annotation-table',
   props: ["hideColumns"],
   data () {
     return {
       annotations: [],
       orderBy: 'ORDER_BY_MSM',
       sortingOrder: 'DESCENDING',
       currentPage: 0,
       recordsPerPage: 15,
       greenCount: 0,
       pageSizes: [15, 20, 25, 30],
       isLoading: false
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
     filter() {
       return this.$store.getters.filter;
     },

     numberOfPages () {
       let n = this.totalCount / this.recordsPerPage;
       if (this.totalCount % this.recordsPerPage > 0)
         n += 1;
       return n;
     },

     gqlFilter () {
       this.currentPage = 0; // FIXME find a better way

       return {
         annotationFilter: this.$store.getters.gqlAnnotationFilter,
         datasetFilter: this.$store.getters.gqlDatasetFilter
       };
     }
   },
   apollo: {
     totalCount: {
       query: gql`query GetCount($filter: AnnotationFilter,
                                 $dFilter: DatasetFilter) {
          countAnnotations(filter: $filter, datasetFilter: $dFilter)
       }`,
       variables () { return this.queryVariables(); },
       update: data => data.countAnnotations,
       debounce: 200
     },
     annotations: {
       query: gql`query GetAnnotations($orderBy: AnnotationOrderBy, $sortingOrder: SortingOrder,
                                       $offset: Int, $limit: Int, $filter: AnnotationFilter, $dFilter: DatasetFilter) {
          allAnnotations(filter: $filter,
                         datasetFilter: $dFilter,
                         orderBy: $orderBy, sortingOrder: $sortingOrder,
                         offset: $offset, limit: $limit) {
            sumFormula
            adduct
            msmScore
            rhoSpatial
            rhoSpectral
            rhoChaos
            fdrLevel
            mz
            dataset {
              institution
              name
              polarity
              metadataJson
            }
            ionImage {
              url
            }
            isotopeImages {
              mz
              url
            }
            possibleCompounds {
              name
              imageURL
              information {
                database
                url
              }
            }
          }

          countAnnotations(filter: $filter, datasetFilter: $dFilter)
        }`,
       variables() {
         return this.queryVariables();
       },
       update: data => data.allAnnotations,
       debounce: 200,
       result (data) {
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
           this._onDataArrival = function() {
             const store = this.$refs.table.store;
             store.commit('setCurrentRow', null);
             this.clearCurrentRow();
           };
         }

         this.greenCount = data.countAnnotations;
       },
       loadingChangeCb (isLoading) {
         this.isLoading = isLoading;
       }
     }
   },
   created() {
     // FIXME copy-paste
     this._onDataArrival = function() {
       const store = this.$refs.table.store;
       store.commit('setCurrentRow', null);
       this.clearCurrentRow();
     };
   },
   methods: {
     onPageSizeChange(newSize) {
       this.recordsPerPage = newSize;
     },
     queryVariables() {
       const {annotationFilter, datasetFilter} = this.gqlFilter;

       return {
         filter: annotationFilter,
         dFilter: datasetFilter,
         orderBy: this.orderBy,
         sortingOrder: this.sortingOrder,
         offset: this.currentPage * this.recordsPerPage,
         limit: this.recordsPerPage
       };
     },

     hidden (columnLabel) {
       return this.hideColumns.indexOf(columnLabel) >= 0;
     },

     renderSumFormula,
     getRowClass (row, col) {
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
     formatDatasetName: (row, col) => row.dataset.name.split('//', 2)[1],

     onSortChange (event) {
       if (!event.order) {
        return;
       }

       this.clearCurrentRow();

       if (event.prop == 'msmScore')
         this.orderBy = 'ORDER_BY_MSM';
       else if (event.prop == 'mz')
         this.orderBy = 'ORDER_BY_MZ';
       else if (event.prop == 'fdrLevel')
         this.orderBy = 'ORDER_BY_FDR_MSM';
       this.sortingOrder = event.order.toUpperCase();
     },

     onPageChange (page) {
       this.currentPage = page - 1;
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

       function setRow (vm, data, rowIndex) {
         const store = vm.$refs.table.store;
         store.commit('setCurrentRow', null);
         store.commit('setData', data);
         store.commit('setCurrentRow', data[rowIndex]);
         vm.clearCurrentRow();
       };

       if (action == 'up' && curIdx == 0) {
         if (this.currentPage == 0)
           return;
         this._onDataArrival = function(data) {
           setRow(this, data, data.length - 1);
         };
         this.currentPage = this.currentPage - 1;
         return;
       }

       if (action == 'down' && curIdx == this.annotations.length - 1) {
         if (this.currentPage == this.numberOfPages - 1)
           return;
         this._onDataArrival = function(data) { setRow(this, data, 0); };
         this.currentPage = this.currentPage + 1;
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
       this.updateFilter({datasetName: row.dataset.name});
     },

     filterSumFormula (row) {
       this.updateFilter({compoundName: row.sumFormula});
     },

     filterMZ (row) {
       this.updateFilter({mz: row.mz});
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
   height: 36px;
   display: flex;
   align-items: center;
   padding: 0 0 0 10px;
 }

 #annot-table th > .cell{
   height: 43px;
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
   display: none;
 }

 .cell-wrapper:hover img {
   max-height: 20px;
   box-shadow: 5px;
   max-width: 20%;
   display: inherit;
   cursor: pointer;
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

</style>
