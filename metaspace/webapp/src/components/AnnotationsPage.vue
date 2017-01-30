<template>
  <el-row :gutter="20">
    <annotation-filter></annotation-filter>

    <el-col :xs="24" :sm="24" :md="24" :lg="tableWidth">
      <annotation-table :hideColumns="hiddenColumns"
                        ref="annotationTable">
      </annotation-table>
    </el-col>

    <el-col :xs="24" :sm="24" :md="24" :lg="24 - tableWidth">
      <annotation-view :annotation="selectedAnnotation">
      </annotation-view>
    </el-col>
  </el-row>
</template>

<script>
 import AnnotationTable from './AnnotationTable.vue';
 import AnnotationFilter from './AnnotationFilter.vue';
 import AnnotationView from './AnnotationView.vue';
 import FILTER_SPECIFICATIONS from '../filterSpecs.js';
 import {mapState} from 'vuex';

 function revMap(d) {
   let revd = {};
   for (var key in d)
     if (d.hasOwnProperty(key))
       revd[d[key]] = key;
   return revd;
 }

 const FILTER_TO_URL = {
   database: 'db',
   institution: 'inst',
   datasetName: 'ds',
   minMSM: 'msmthr',
   compoundName: 'mol',
   adduct: 'add',
   mz: 'mz',
   fdrLevel: 'fdrlvl'
 };

 const URL_TO_FILTER = revMap(FILTER_TO_URL);

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

     ...mapState({
       annotationFilter: 'filter',
       defaultFilter: 'defaultFilter',
       selectedAnnotation: 'annotation'
     })
   },
   components: {
     AnnotationTable,
     AnnotationFilter,
     AnnotationView
   },
   created() {
     this.decodeParams(this.$route.query);
   },
   watch: {
     '$route.query': function (query) {
       this.decodeParams(query);
     },

     annotationFilter: function(filter) {
       this.redraw();
     }
   },
   methods: {
     redraw() {
       this.$router.replace({
         path: this.$route.path,
         query: this.encodeParams()
       });
     },

     decodeParams(query) {
       let filter = Object.assign({}, this.defaultFilter);
       for (var key in query) {
         const fKey = URL_TO_FILTER[key];
         if (fKey) {
           filter[fKey] = query[key];
           // yes, I'm not fluent in all this null vs undefined bullshit
           if (filter[fKey] === null)
             filter[fKey] = undefined;
         }
       }
       this.$store.commit('updateFilter', filter);
     },

     encodeParams() {
       let q = {};
       for (var key in FILTER_TO_URL) {
         if (this.annotationFilter[key] != this.defaultFilter[key]) {
           q[FILTER_TO_URL[key]] = this.annotationFilter[key] || null;
         }
       }
       return q;
     }
   }
 }
</script>
