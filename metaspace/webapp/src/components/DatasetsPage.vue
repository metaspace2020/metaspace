<template>
  <el-row>
    <router-view></router-view>
  </el-row>
</template>

<script>
 import FILTER_SPECIFICATIONS from '../filterSpecs.js';

 function datasetRelated(filter) {
   let f = {};
   for (var key in filter) {
     if (FILTER_SPECIFICATIONS[key].levels.indexOf('dataset') == -1)
       continue;
     f[key] = filter[key];
   }
   return f;
 }

 export default {
   name: 'datasets-page',
   created() {
     const f = this.$store.state.lastUsedFilters['/annotations'];
     if (!f)
       return;
     this.$store.commit('updateFilter', datasetRelated(f.filter));
   }
 }
</script>
