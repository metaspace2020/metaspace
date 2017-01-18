<template>
  <div id="app">
    <el-row>
      <metaspace-header>
      </metaspace-header>

      <div class="warning">
        NOT PRODUCTION-READY! Known limitations: <b>NO</b> CSV export; <b>NO</b> isotope pattern plot; <b>NO</b> user profiles.
      </div>
    </el-row>

    <router-view></router-view>
  </div>
</template>

<script>
 import MetaspaceHeader from './components/MetaspaceHeader.vue';
 import gql from 'graphql-tag';

 export default {
   name: 'app',
   components: {
     MetaspaceHeader
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
