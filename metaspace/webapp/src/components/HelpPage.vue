<template>
  <div id='help-wrapper'>
    <div id='help-container'>
      We try our best to make the website as intuitive as possible, but it's unavoidable that some features are hard to discover on your own.
      <br/>
      That's why we prepared a few thematic website tours:

      <div class="tour-panel">
        <div class="tour-block">
          <el-button icon='el-icon-caret-right' @click='intro'>Introduction</el-button>
          <p>
            Just enough to get you started
          </p>
        </div>

        <div class="tour-block">
          <el-button icon='el-icon-caret-right' @click='filtering'>Filtering</el-button>
          <p>
            Learn to steer snappily through<br/> the sea of molecular annotations!
          </p>
        </div>

        <div class="tour-block">
          <el-button icon='el-icon-caret-right' @click='diagnostics'>Diagnostic plots</el-button>
          <p>
            Get better insight into how scores are assigned to molecular formulae
          </p>
        </div>
      </div>

      <p>
        You can also take a look at <a href="https://www.slideshare.net/Metaspace2020/metaspace-training-2017">slides from the last training course</a> on METASPACE engine (OurCon '16).
      </p>

      <p>
        If you have any ideas on how to improve the website, please send them to
        <a href="mailto:contact@metaspace2020.eu">our e-mail address</a>.
      </p>
    </div>
  </div>
</template>

<script>
 import Vue from 'vue';

 import introTour from '../tours/intro.tour';
 import filteringTour from '../tours/filtering.tour';
 import diagnosticsTour from '../tours/diagnostics.tour';
 import TourStep from './TourStep.vue';

 export default {
   name: 'help-page',
   methods: {
     intro() {
       this.$store.commit('startTour', introTour);
     },

     filtering() {
       this.$store.commit('startTour', filteringTour);
     },

     diagnostics() {
       this.$store.commit('startTour', diagnosticsTour);
     }
   }
 }
</script>

<style>
 #help-wrapper {
   padding: 100px 20px 20px 20px;
   display: flex;
   justify-content: center;
 }

 #help-container {
   max-width: 950px;
 }

 .tour-panel {
   display: flex;
   flex-direction: row;
   flex-wrap: wrap;
   justify-content: space-between;
   margin-top: 20px;
 }

 .tour-block {
   width: 270px;
   margin: 10px;
   padding: 8px;
   height: 120px;
   text-align: center;
 }

 .tour-block .el-button {
   color: blue;
   width: 180px;
 }
</style>
