<template>
  <div id="app">
    <el-row>
      <metaspace-header v-model="page">
      </metaspace-header>

      <div class="warning">
        NOT PRODUCTION-READY! Known limitations: only annotations from <b>HMDB</b> are shown; <b>NO</b> CSV export; <b>NO</b> isotope pattern plot.
      </div>
    </el-row>

    <el-row id="main-content" :gutter="20" v-if="page == 'results'">
      <el-col :xs="24" :sm="24" :md="24" :lg="12">
        <annotation-filter
            @change="updateTable"
            @fdrChange="updateFDRLevel">
        </annotation-filter>
        <annotation-table :filter="annotationFilter"
                          :fdrLevel="fdrLevel"
                          @annotationSelected="updateAnnotationView">
        </annotation-table>
      </el-col>

      <el-col :xs="24" :sm="24" :md="24" :lg="12">
        <annotation-view :annotation="selectedAnnotation">
        </annotation-view>
      </el-col>
    </el-row>

    <el-row id="main-content" v-if="page == 'datasets'">
      <dataset-table></dataset-table>
    </el-row>
  </div>
</template>

<script>
 import AnnotationTable from './components/AnnotationTable.vue';
 import AnnotationFilter from './components/AnnotationFilter.vue';
 import AnnotationView from './components/AnnotationView.vue';
 import DatasetTable from './components/DatasetTable.vue';
 import MetaspaceHeader from './components/MetaspaceHeader.vue';
 import gql from 'graphql-tag';

 export default {
   name: 'app',
   data () {
     return {
       datasetNames: [],
       annotationFilter: {datasetName: '', minMSM: 0.1},
       selectedAnnotation: null,
       fdrLevel: 0.1,
       page: "results"
     }
   },
   components: {
     AnnotationTable,
     AnnotationFilter,
     AnnotationView,
     DatasetTable,
     MetaspaceHeader
   },
   methods: {
     updateTable (annotationFilter) {
       this.annotationFilter = annotationFilter;
     },

     updateFDRLevel (fdr) {
      this.fdrLevel = fdr;
     },

     updateAnnotationView (annotation) {
       this.selectedAnnotation = annotation;
     },

     onSignInSuccess (guser) {
       console.log(guser);
     },

     onSignInError (error) {
       console.log(error);
     }
   }
 }
</script>

<style>
 #app {
   font-family: 'Roboto', Helvetica, sans-serif;
   -webkit-font-smoothing: antialiased;
   -moz-osx-font-smoothing: grayscale;
   color: #2c3e50;
   margin-top: 0px;
   padding: 3px;
 }

 h1, h2 {
   font-weight: normal;
 }

 ul {
   list-style-type: none;
   padding: 0;
 }

 li {
   margin: 0 10px;
 }

 a {
   color: #42b983;
 }

 .g-signin-button {
     display: inline-block;
     padding: 4px 8px;
     border-radius: 3px;
     background-color: #3c82f7;
     color: #fff;
     box-shadow: 0 3px 0 #0f69ff;
 }

 #main-content {
   padding-top: 82px;
 }

 .warning {
  position: fixed;
  z-index: 1000;
  top: 62px;
  left: 0;
  right: 0;
  height: 28px;
  text-align: center;
  background-color: #fd8;
 }

</style>
