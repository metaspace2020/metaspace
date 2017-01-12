<template>
  <el-row>
    <el-table id="dataset-table"
              :data="datasets"
              border
              highlight-current-row
              width="100%">
      <el-table-column property="institution" label="Institution"
        min-width="10">
      </el-table-column>
      <el-table-column property="name" label="Name" 
        :formatter="formatDatasetName"
        min-width="30">
      </el-table-column>
      <el-table-column property="submitter" label="Submitted by"
        :formatter="formatSubmitter"
        min-width="30">
      </el-table-column>
      <el-table-column property="polarity" label="Mode"
        min-width="10">
      </el-table-column>
      <el-table-column property="ionisationSource" label="Source"
        min-width="7">
      </el-table-column>
      <el-table-column property="analyzer.type" label="Analyzer"
        min-width="10">
      </el-table-column>
      <el-table-column property="analyzer.resolvingPower" label="RP @ 400"
        :formatter="formatResolvingPower"
        min-width="10">
      </el-table-column>
    </el-table>
  </el-row>
</template>

<script>
 import gql from 'graphql-tag';

 export default {
   name: 'dataset-table',
   data () {
     return {
       datasets: [],
       currentPage: 0,
       recordsPerPage: 10
     }
   },
   apollo: {
     datasets: {
       query: gql`{allDatasets(offset: 0, limit: 1000) {
         id
         name
         institution
         submitter {
           name
           surname
         }
         polarity
         ionisationSource
         analyzer {
           type
           resolvingPower(mz: 400)
         }
       }}`,
       update: data => data.allDatasets
     }
   },
   methods: {
     formatSubmitter: (row, col) =>
       row.submitter.name + " " + row.submitter.surname,
     formatDatasetName: (row, col) => 
       row.name.split('//', 2)[1],
     formatResolvingPower: (row, col) =>
       (row.analyzer.resolvingPower / 1000).toFixed(0) * 1000
   }
 }
</script>
