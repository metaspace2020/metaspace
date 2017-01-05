<template>
  <div id="app">
    <el-row>
      <metaspace-header>
      </metaspace-header>
    </el-row>
    <el-row id="main-content" :gutter="20">
      <el-col :span=12>
        <annotation-filter
            @change="updateTable"
            @fdrChange="updateFDRLevel">
        </annotation-filter>
        <annotation-table :filter="annotationFilter"
                          :fdrLevel="fdrLevel"
                          @annotationSelected="updateAnnotationView">
        </annotation-table>
      </el-col>

      <el-col :span=12>
        <annotation-view :annotation="selectedAnnotation">
        </annotation-view>
      </el-col>
    </el-row>
  </div>
</template>

<script>
 import AnnotationTable from './components/AnnotationTable.vue';
 import AnnotationFilter from './components/AnnotationFilter.vue';
 import AnnotationView from './components/AnnotationView.vue';
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
       googleSignInParams: {
         client_id: '268025466937-o15ia458d8lnuohj09slh1aqbl3ja33i.apps.googleusercontent.com'
       }
     }
   },
   components: {
     AnnotationTable,
     AnnotationFilter,
     AnnotationView,
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
   padding-top: 62px;
 }

</style>
