<template>
  <div id="app">
    <el-row>
      <metaspace-header>
      </metaspace-header>
    </el-row>

    <router-view class="main-content">
    </router-view>

    <tour-step ref="tour" :tour="this.$store.state.currentTour"></tour-step>
  </div>
</template>

<script>

 import MetaspaceHeader from './components/MetaspaceHeader.vue';
 import TourStep from './components/TourStep.vue';

 export default {
   name: 'app',
   components: {
     MetaspaceHeader,
     TourStep
   }
 }
</script>

<style lang="scss">

 html {
   font-family: 'Roboto', Helvetica, sans-serif;
   overflow-y: scroll; /* always show the right scrollbar to avoid flickering */
 }

 #app {
   -webkit-font-smoothing: antialiased;
   -moz-osx-font-smoothing: grayscale;
   color: #2c3e50;
   margin-top: 0px;
   padding: 3px;
 }

 h1, h2 {
   font-weight: normal;
 }

 a {
   color: #428943;
 }

 .main-content {
   padding-top: 62px;
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

 #signin-div {
   position: fixed;
   align-self: center;
   display: none;
   top: 18px;
   font-size: 18px;
   right: 81px;
   color: white;
   z-index: 1000;
 }

 .signin-button, .signout-button {
   position: fixed;
   cursor: pointer;
   z-index: 1000;
   top: 11px;
   right: 11px;
   font-size: 18px;
   color: rgb(0, 105, 224);
   background-color: #f8f8f8;
   border-radius: 5px;
   padding: 5px;
   text-decoration: none;
 }

 .el-loading-mask {
   /* otherwise filter dropdowns are behind it */
   z-index: 2000;
 }
</style>
