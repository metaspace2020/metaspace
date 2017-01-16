<template>
  <el-row id="main-content">
    <dataset-table></dataset-table>
  </el-row>
</template>

<script>
 import DatasetTable from './DatasetTable.vue';

 export default {
   name: 'datasets-page',
   components: {
     DatasetTable
   }
 }
</script>
