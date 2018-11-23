<template>
  <div id='help-wrapper'>

    <div id='help-container'>
      <p><b>Collaboration with groups and projects</b></p>
      We have added new ways for you to share your data with others:
      <div class="help-page">
        <img src="../../assets/help_page_release_notes_hq.png" style="width: 100%; object-fit: contain;">
      </div>

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

      <!--<p><b>Format:</b> We can receive only data in the imzML (imaging MS) or mzML (LC-MS) centroided format. Please check out <a href="http://project.metaspace2020.eu/imzml">our instructions</a> for converting datasets into these formats. If you are experiencing difficulties, please contact your instrument vendor.</p>-->
      <p><b>Format:</b> We can receive only data in the imzML centroided format. Please check out <a href="http://project.metaspace2020.eu/imzml">our instructions</a> for converting datasets into this format. If you are experiencing difficulties, please contact your instrument vendor.</p>

      <p><b>Step-by-step tutorial:</b> Please read our <a href="https://speakerdeck.com/metaspace2020/metaspace-training-guide">training guide slides</a> providing an introduction to METASPACE as well as a step-by-step tutorial with screenshots.</p>

      <p>
        If you have any ideas on how to improve the website, please
        <a href="https://gitter.im/metaspace2020/metaspace">chat with us on Gitter</a> or
        send them to <a href="mailto:contact@metaspace2020.eu">our e-mail address</a>.
      </p>
    </div>
  </div>
</template>

<script>
 import Vue from 'vue';

 import introTour from '../../tours/intro.tour';
 import filteringTour from '../../tours/filtering.tour';
 import diagnosticsTour from '../../tours/diagnostics.tour';
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
   padding: 20px 20px 20px 20px;
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

 .help-page {
   max-width: 950px;
 }
</style>
