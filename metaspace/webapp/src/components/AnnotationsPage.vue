<template>
  <div id="annot-page">
    <filter-panel level="annotation"></filter-panel>

    <el-row>
      <el-col id="annot-table-container" :xs="24" :sm="24" :md="24" :lg="tableWidth">
        <annotation-table :hideColumns="hiddenColumns">
        </annotation-table>
      </el-col>

      <el-col :xs="24" :sm="24" :md="24" :lg="24 - tableWidth" id="annot-view-container">
        <annotation-view :annotation="selectedAnnotation"
                        v-if="selectedAnnotation">
        </annotation-view>

        <el-col class="av-centered no-selection" v-else>
          <div style="align-self: center;">
            <i class="el-icon-loading" v-if="this.$store.state.tableIsLoading"></i>
          </div>
        </el-col>
      </el-col>
    </el-row>
  </div>
</template>

<script>
 import AnnotationTable from './AnnotationTable.vue';
 import AnnotationView from './AnnotationView.vue';
 import FilterPanel from './FilterPanel.vue';
 import {mapState, mapGetters} from 'vuex';

 export default {
   name: 'annotations-page',
   computed: {
     hiddenColumns() {
       const {institution, database, datasetIds} = this.filter;
       let hiddenColumns = [];
       const singleDatasetSelected = datasetIds && datasetIds.length == 1;
       if (singleDatasetSelected)
         hiddenColumns.push('Dataset');
       if (institution || singleDatasetSelected)
         hiddenColumns.push('Institution');
       if (database)
         hiddenColumns.push('Database');
       return hiddenColumns;
     },

     tableWidth() {
       return 14 - 2 * this.hiddenColumns.length;
     },

     selectedAnnotation() {
       return this.$store.state.annotation;
     },

     filter() {
       return this.$store.getters.filter;
     }
   },
   created() {
     this.$store.commit('updateFilter', this.filter);
   },
   destroyed() {
     this.$store.commit('setAnnotation', undefined);
   },
   components: {
     AnnotationTable,
     AnnotationView,
     FilterPanel
   }
 }
</script>

<style>

 #annot-table-container {
   top: 80px;
 }

 @media (min-width: 1200px) {
   #annot-table-container {
     position: sticky;
     position: -webkit-sticky;
   }
 }

 #annot-table-container, #annot-view-container {
   padding: 0px 5px;
 }
</style>
