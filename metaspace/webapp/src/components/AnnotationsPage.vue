<template>
  <el-row :gutter="20">
    <filter-panel level="annotation"></filter-panel>

    <el-col id="annot-table-column" :xs="24" :sm="24" :md="24" :lg="tableWidth">
      <annotation-table :hideColumns="hiddenColumns">
      </annotation-table>
    </el-col>

    <el-col :xs="24" :sm="24" :md="24" :lg="24 - tableWidth">
      <annotation-view :annotation="selectedAnnotation"
                       v-if="selectedAnnotation">
      </annotation-view>

      <el-col class="av-centered no-selection" v-else>
        <div style="align-self: center;">
          Select an annotation by clicking the table
        </div>
      </el-col>

    </el-col>
  </el-row>
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
       const {institution, datasetName, database} = this.annotationFilter;
       let hiddenColumns = [];
       if (datasetName)
         hiddenColumns.push('Dataset');
       if (institution || datasetName)
         hiddenColumns.push('Institution');
       if (database)
         hiddenColumns.push('Database');
       return hiddenColumns;
     },

     tableWidth() {
       return 14 - 2 * this.hiddenColumns.length;
     },

     ...mapState({selectedAnnotation: 'annotation'}),
     ...mapGetters({annotationFilter: 'filter'})
   },
   created() {
     const {path} = this.$store.state.route;
     const lastParams = this.$store.state.lastUsedFilters[path];
     if (lastParams) {
       // returned to the page after first load:
       // restore last used set of filters (= redirect)
       let f = lastParams.filter;

       const df = this.$store.state.lastUsedFilters['/datasets'];
       if (df)
         f = Object.assign({}, lastParams.filter, df.filter);

       this.$store.commit('updateFilter', f);
     } else {
       // first page load:
       // setup the store so that filters (parsed from the URL) are shown
       this.$store.commit('updateFilter', this.annotationFilter);
     }
   },
   components: {
     AnnotationTable,
     AnnotationView,
     FilterPanel
   }
 }
</script>

<style>

 #annot-table-column {
   position: sticky; // FF, Chrome >= 56
   position: -webkit-sticky; // Safari
   top: 80px;
 }

</style>
