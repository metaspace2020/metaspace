<template>
  <el-row id="main-content" :gutter="20">
    <annotation-filter
        :filter="annotationFilter"
        :fdrLevel="fdrLevel"
        @change="onFilterChange"
        @fdrChange="updateFDRLevel">
    </annotation-filter>

    <el-col :xs="24" :sm="24" :md="24" :lg="tableWidth">
      <annotation-table :filter="annotationFilter"
                        :fdrLevel="fdrLevel"
                        :hideColumns="hiddenColumns"
                        ref="annotationTable"
                        @filterChange="onFilterChange"
                        @annotationSelected="updateAnnotationView">
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
 import FILTER_SPECIFICATIONS from '../filterSpecs.js';
 import AnnotationView from './AnnotationView.vue';

 function revMap(d) {
   let revd = {};
   for (var key in d)
     if (d.hasOwnProperty(key))
       revd[d[key]] = key;
   return revd;
 }

 const DEFAULT_FILTER = {
   database: 'HMDB',
   datasetName: undefined,
   minMSM: 0.1,
   compoundName: undefined,
   adduct: undefined,
   mz: undefined
 };

 const DEFAULT_FDR = 0.1;

 const FILTER_TO_URL = {
   database: 'db',
   datasetName: 'ds',
   minMSM: 'msmthr',
   compoundName: 'mol',
   adduct: 'add',
   mz: 'mz'
 };

 const URL_TO_FILTER = revMap(FILTER_TO_URL);

 export default {
   name: 'annotations-page',
   data () {
     return {
       annotationFilter: DEFAULT_FILTER,
       selectedAnnotation: null,
       fdrLevel: DEFAULT_FDR
     }
   },
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
     }
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
     }
   },
   methods: {
     redraw() {
       this.$router.replace({
         path: this.$route.path,
         query: this.encodeParams()
       });
     },

     onFilterChange (annotationFilter) {
       // When the set of filters changes, we use the router to update the page.
       // This way, all filters are encoded in the URL.
       this.annotationFilter = annotationFilter;
       this.redraw();
     },

     updateFDRLevel (fdr) {
       this.fdrLevel = fdr;
       this.redraw();
     },

     updateAnnotationView (annotation) {
       this.selectedAnnotation = annotation;
     },

     decodeParams(query) {
       let filter = {};
       for (var key in URL_TO_FILTER) {
         if (query[key])
           filter[URL_TO_FILTER[key]] = query[key];
       }
       this.annotationFilter = Object.assign({}, DEFAULT_FILTER, filter);
       this.fdrLevel = query.fdrlvl || DEFAULT_FDR;
     },

     encodeParams() {
       let q = {};
       for (var key in FILTER_TO_URL)
         if (this.annotationFilter[key] != DEFAULT_FILTER[key]) {
           q[FILTER_TO_URL[key]] = this.annotationFilter[key] ||
                                   FILTER_SPECIFICATIONS[key].initialValue;
         }
       q.fdrlvl = this.fdrLevel;
       return q;
     }
   }
 }
</script>
