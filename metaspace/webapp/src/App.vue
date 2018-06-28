<template>
  <div id="app">
    <metaspace-header>
    </metaspace-header>

    <router-view class="main-content">
    </router-view>

    <!--metaspace-footer>
    </metaspace-footer-->

    <tour-step ref="tour" :tour="this.$store.state.currentTour"></tour-step>
  </div>
</template>

<script>

 import MetaspaceHeader from './components/MetaspaceHeader.vue';
 import MetaspaceFooter from './components/MetaspaceFooter.vue';
 import TourStep from './components/TourStep.vue';

 export default {
   name: 'app',
   components: {
     MetaspaceHeader,
     MetaspaceFooter,
     TourStep
   }
 }
</script>

<style>

 html {
   font-family: 'Roboto', Helvetica, sans-serif;
   overflow-y: scroll; /* always show the right scrollbar to avoid flickering */
 }

 /* http://matthewjamestaylor.com/blog/keeping-footers-at-the-bottom-of-the-page */
 html, body {
   height: 100%;
   margin: 0;
   padding: 0;
 }

 #app {
   -webkit-font-smoothing: antialiased;
   -moz-osx-font-smoothing: grayscale;
   color: #2c3e50;
   margin: 0;
   min-height: 100%;
   position: relative;
 }

 h1, h2 {
   font-weight: normal;
 }

 a {
   color: #428943;
 }

 .main-content {
   padding-top: 70px;     /* see MetaspaceHeader.vue: 70 = 62 height + 8 margin */
   /* padding-bottom: 130px; see MetaspaceFooter.vue: 130 = 30 height + 100 margin */
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
