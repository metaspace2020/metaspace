<template>
  <el-row>
    <el-table id="annot-table"
              ref="table"
              :data="annotations"
              border
              highlight-current-row
              width="100%"
              tabindex="1"
              default-sort-order="descending"
              default-sort-prop="msmScore"
              :row-class-name="getRowClass"
              @keyup.native="onKeyUp"
              @keydown.native="onKeyDown"
              @current-change="onCurrentRowChange"
              @sort-change="onSortChange">
      <el-table-column property="dataset.institution"
                       label="Institution" v-if="!hidden('Institution')"
                       min-width="95">
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

      <el-table-column property="mz"
                       label="m/z"
                       sortable
                       :formatter="formatMZ"
                       min-width="65">
      </el-table-column>
      <el-table-column property="msmScore"
                       label="MSM"
                       sortable
                       :formatter="formatMSM"
                       min-width="60">
      </el-table-column>
    </el-table>

    <el-pagination :total="totalCount"
                   :page-size="recordsPerPage"
                   @size-change="onPageSizeChange"
                   :page-sizes="pageSizes"
                   :current-page="currentPage + 1"
                   @current-change="onPageChange"
                   layout="pager,sizes">
    </el-pagination>

    <div style="padding-top: 10px">
        <span style="background: #efe;">Rows with FDR &le; {{ fdrLevel }}:</span>
        <span style="font-weight: bold; padding-left: 10px;">{{ greenCount }}</span>
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
   props: ["filter", "fdrLevel", "hideColumns"],
   data () {
     return {
       annotations: [],
       orderBy: 'ORDER_BY_MSM',
       sortingOrder: 'DESCENDING',
       currentPage: 0,
       recordsPerPage: 15,
       greenCount: 0,
       pageSizes: [15, 20, 25, 30]
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
     numberOfPages () {
       let n = this.totalCount / this.recordsPerPage;
       if (this.totalCount % this.recordsPerPage > 0)
         n += 1;
       return n;
     },

     gqlFilter () {
       this.currentPage = 0;
       return {
         database: this.filter.database,
         datasetNamePrefix: this.filter.datasetName,
         msmScoreFilter: {min: this.filter.minMSM || 0.0, max: 1.0},
         compoundQuery: this.filter.compoundName,
         adduct: this.filter.adduct
       };
     }
   },
   apollo: {
     totalCount: {
       query: gql`query GetCount($filter: AnnotationFilter) {
          countAnnotations(filter: $filter)
       }`,
       variables () { return this.queryVariables(); },
       update: data => data.countAnnotations,
       debounce: 200
     },
     annotations: {
       query: gql`query GetAnnotations($orderBy: AnnotationOrderBy, $sortingOrder: SortingOrder,
                                       $offset: Int, $limit: Int, $filter: AnnotationFilter, $fdrFilter: AnnotationFilter) {
          allAnnotations(filter: $filter,
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

          countAnnotations(filter: $fdrFilter)
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
       const filter = this.gqlFilter;
       let fdrFilter = Object.assign({}, filter);
       fdrFilter.fdrLevel = this.fdrLevel;

       return {
         filter,
         fdrFilter,
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
     getRowClass (row, col) { return row.fdrLevel <= this.fdrLevel ? 'fdr-pass' : 'fdr-reject'; },
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
       this.sortingOrder = event.order.toUpperCase();
     },

     onPageChange (page) {
       this.currentPage = page - 1;
     },

     onCurrentRowChange (row) {
       if (row)
         this.$emit('annotationSelected', row);
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

     filterDataset (row) {
       let filter = Object.assign({}, this.filter,
                                  {datasetName: row.dataset.name});
       this.$emit('filterChange', filter);
     },

     filterSumFormula (row) {
       let filter = Object.assign({}, this.filter,
                                  {compoundName: row.sumFormula})
       this.$emit('filterChange', filter);
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

 .el-table__body .fdr-pass>td {
   background-color: #efe;
 }

 .el-table__body .fdr-reject>td {
   background-color: #fee;
 }

 .el-table__body tr.fdr-pass.current-row > td {
   background-color: #afa;
 }

 .el-table__body tr.fdr-reject.current-row > td {
   background-color: #faa;
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

 /* strange chinese developers intentionally set it to zero:
    goo.gl/vN9m6A */
 .el-pager li {
   border-right: 1px solid #d3dce6;
 }

 /* same with left border for next page */
 .el-pager li.active+li {
   border-left: 1px solid #d3dce6;
 }

</style>
