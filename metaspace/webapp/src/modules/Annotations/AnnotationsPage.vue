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
 import {FilterPanel} from '../Filters/index';

 export default {
   name: 'annotations-page',
   computed: {
     hiddenColumns() {
       const {group, database, datasetIds} = this.filter;
       let hiddenColumns = [];
       const singleDatasetSelected = datasetIds && datasetIds.length == 1;
       if (singleDatasetSelected)
         hiddenColumns.push('Dataset');
       if (group || singleDatasetSelected)
         hiddenColumns.push('Group');
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
  #annot-page {
    padding: 0 5px;
  }

  #annot-table-container {
    padding-right: 5px;
  }

  @media (min-width: 1200px) {
    #annot-table-container {
      position: sticky;
      position: -webkit-sticky;
    }
  }

  #annot-view-container {
    padding-left: 5px;
  }
</style>
