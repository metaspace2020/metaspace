<template>
  <div id="upload-page" v-if="!enableUploads">
    <div id="maintenance-message">
      Uploading is temporarily disabled so that we can safely update the website.
      <br/>
      Please wait a few hours and reload the page. Thank you for understanding!
    </div>
  </div>

  <div id="upload-page" v-else-if="!isSignedIn">
    <div id="sign-in-message">
      <intro-message>
        <p><b>To get started, click "Sign in" to sign in or create an account.</b></p>
      </intro-message>
    </div>
  </div>

  <div id="upload-page" v-else>
    <div id="upload-left-pane">
      <div id="instructions">

        <p style="font-size: 18px" v-if="introIsHidden">
          <span>Submitting for the first time?</span>
          <a style="cursor: pointer;" @click="introIsHidden = false">Show instructions</a>
        </p>

        <div v-show="!introIsHidden">
          <intro-message>
            <p>To start the submission, just drop the files into the box below, fill in the metadata form, and click the Submit button.</p>
          </intro-message>
        </div>
      </div>

      <fine-uploader :config="fineUploaderConfig"
                     ref="uploader"
                     @upload="onUpload" @success="onSuccess" @failure="onFailure">
      </fine-uploader>
    </div>

    <div id="upload-right-pane">
      <metadata-editor ref="editor"
                       :enableSubmit="enableSubmit"
                       @submit="onFormSubmit"
                       disabledSubmitMessage="Your files must be uploaded first"
                       v-bind:validationErrors="validationErrors">
      </metadata-editor>
    </div>
  </div>
</template>

<script>
 // TODO: try https://github.com/FineUploader/vue-fineuploader once it's ready for production

 import FineUploader from './FineUploader.vue';
 import MetadataEditor from './MetadataEditor.vue';
 import IntroMessage from './IntroMessage.vue';
 import Vue from 'vue';

 import * as config from '../clientConfig.json';
 import {getJWT, pathFromUUID} from '../util';
 import {submitDatasetQuery} from '../api/dataset';

 export default {
   name: 'upload-page',
   mounted() {
     const {query} = this.$store.state.route;
     if (query['first-time'] !== undefined)
       this.introIsHidden = false;
   },
   data() {
     return {
       fineUploaderConfig: config.fineUploader,
       enableSubmit: false,
       introIsHidden: true,
       enableUploads: config.enableUploads,
       validationErrors: []
     }
   },
   components: {
     FineUploader,
     MetadataEditor,
     IntroMessage
   },

   computed: {
     isSignedIn() {
       return this.$store.state.user != null;
     }
   },

   methods: {
     safelyParseJSON(json) {
       let parseRes;
       try {
         parseRes = JSON.parse(json);
       } catch (err) {
         console.log(err.message);
         return 'failed_parsing' + err.message;
       }
       return parseRes;
     },

     onUpload(filenames) {
       const imzml = filenames.filter(f => f.toLowerCase().endsWith('imzml'))[0];
       Vue.nextTick(() => {
         this.$refs.editor.suggestDatasetName(imzml.slice(0, imzml.length - 6));
       });
     },

     onSuccess(filenames) {
       this.enableSubmit = true;
     },

     onFailure(failedFiles) {
       console.log(failedFiles);
     },

     onFormSubmit(_, formData, isPublic) {
       const uuid = this.$refs.uploader.getUUID();
       this.submitDataset(uuid, formData, isPublic).then(() => {
         this.validationErrors = [];
         this.enableSubmit = false;
         this.$refs.uploader.reset();
         this.$refs.editor.resetDatasetName();
         this.$message({
           message: 'Your dataset was successfully submitted!',
           type: 'success'
         });
       }).catch(err => {
         console.log(err.message);
         const graphQLError = JSON.parse(err.graphQLErrors[0].message);
         if (graphQLError['type'] === 'failed_validation') {
           this.validationErrors = graphQLError['validation_errors'];
           this.$message({
             message: 'Please fix the highlighted fields and submit again',
             type: 'error'
           });
         } else {
           this.$message({
             message: 'Metadata submission failed :( Contact us: contact@metaspace2020.eu',
             type: 'error',
             duration: 0,
             showClose: true
           })
         }
       })
     },

     submitDataset(uuid, formData, isPublic) {
       console.log("submitting " + uuid);
       return getJWT()
         .then(jwt => this.$apollo.mutate({
           mutation: submitDatasetQuery,
           variables: {
             path: pathFromUUID(uuid),
             value: formData,
             jwt,
             isPublic
           }}));
     }
   }
 }

</script>

<style>
 #instructions {
 }

 #upload-page, #maintenance-message {
   display: flex;
   flex-wrap: wrap;
   flex-direction: row;
   justify-content: center;
 }

 #upload-left-pane {
   flex-basis: 700px;
   flex-grow: 1;
   max-width: 1000px;
   padding: 20px;
 }

 #upload-right-pane {
   flex-basis: 1000px;
 }

 #maintenance-message {
   font-size: 22px;
   color: #e44;
   max-width: 900px;
   margin: 30px;
   border: dotted #a00;
   padding: 10px;
   text-align: center;
 }

  #sign-in-message {
    padding: 20px;
  }
</style>
