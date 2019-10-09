<script src="../../../../graphql/src/context.ts"></script>
<template>
  <div id="app">
    <metaspace-header>
    </metaspace-header>

    <!--
      :key="$route.path" is used to force the content to be remounted if a non-querystring param in the URL changes.
      This ensures that a loading screen is displayed and no unnecessary state is retained when e.g. switching
      between group profile pages or datasets
    -->
    <router-view :key="$route.path" />

    <!--metaspace-footer>
    </metaspace-footer-->

    <dialog-controller />
    <!--<release-notes-dialog />-->

    <tour-step ref="tour" :tour="$store.state.currentTour"></tour-step>
    <new-feature-popup v-if="features.new_feature_popups && $store.state.currentTour == null"/>
  </div>
</template>

<script>
 import * as cookie from 'js-cookie';
 import MetaspaceHeader from './MetaspaceHeader.vue';
 import MetaspaceFooter from './MetaspaceFooter.vue';
 // import ReleaseNotesDialog from './ReleaseNotesDialog.vue';
 import NewFeaturePopup from './NewFeaturePopup.vue';
 import TourStep from './TourStep.vue';
 import {DialogController} from '../Account';
 import config from '../../config';
 import Vue, {ComponentOptions} from 'vue';
 import 'element-ui'; // Needed for Vue.$alert augmentation

 /** @type {ComponentOptions<Vue> & Vue} */
 export default {
   name: 'app',
   components: {
     MetaspaceHeader,
     MetaspaceFooter,
     // ReleaseNotesDialog,
     NewFeaturePopup,
     TourStep,
     DialogController,
   },
   data() {
     return {
       features: config.features
     }
   },
   async created() {
     const flashMessage = cookie.getJSON('flashMessage');
     if (flashMessage) {
       try {
         if (flashMessage.type === 'verify_email_success') {
           await this.$alert('Your email address was successfully verified. You may now upload datasets to METASPACE.',
             'Welcome to METASPACE', {type: 'success'});
         } else if (flashMessage.type === 'verify_email_failure') {
           await this.$alert('This email verification link is invalid or has expired. Try signing in or resetting your password. ' +
             'If this keeps happening, please <a href="mailto:contact@metaspace2020.eu">let us know</a>.',
             'Something went wrong!', {type: 'warning', dangerouslyUseHTMLString: true});
         } else if (flashMessage.type === 'review_token_success') {
           await this.$alert('You have been granted access to a private project.',
             'Welcome to METASPACE', {type: 'success'});
         }
       } catch (err) {
         // Ignore any errors - promise rejection here just means that the user cancelled out of the dialog
       } finally {
         cookie.remove('flashMessage');
       }
     }
   }
 };
</script>

<style>

  @font-face {
    /* Roboto doesn't contain superscript glyphs, and the fallback is OS-dependent. OSX's fallback, Helvetica,
     looks bad for the superscript + and - characters in formatted ion formulas, because it's too small to read. */

    font-family: SUPERSCIPT_OVERRIDE;
    src: local('Lucida Grande'), local('-apple-system'), local('serif');
    unicode-range: U+207A-207B;
  }

 html {
   font-family: 'Roboto', SUPERSCIPT_OVERRIDE, Helvetica, sans-serif;
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
