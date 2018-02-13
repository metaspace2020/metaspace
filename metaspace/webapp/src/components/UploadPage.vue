<template>
  <div id="upload-page" v-if="!enableUploads">
    <div id="maintenance-message">
      Uploading is temporarily disabled so that we can safely update the website.
      <br/>
      Please wait a few hours and reload the page. Thank you for understanding!
    </div>
  </div>

  <div id="upload-page" v-else>
    <div id="upload-left-pane">
      <div id="filter-panel-container">
        <filter-panel level="upload"></filter-panel>
      </div>

      <div id="instructions">

        <p style="font-size: 18px" v-if="introIsHidden">
          <span>Submitting for the first time?</span>
          <a style="cursor: pointer;" @click="introIsHidden = false">Show instructions</a>
        </p>

        <div v-show="!introIsHidden">
          <p>Thank you for considering submitting your data to METASPACE! Here are the key points you need to know:</p>

          <p><b>Public results, private data</b><br/> Annotation results for all data submitted to METASPACE become public. The submitted data does not become public but you give us a permission to store and process it as well as publicly show and share the annotation results. At any point of time you can request to delete your data or the annotation results.</p>

           <p><b>Type of MS:</b> We can annotate only FTICR- or Orbitrap- imaging MS data.</p>

          <p><b>Format:</b> We can receive only data in the imzML centroided format. Please check out <a href="http://project.metaspace2020.eu/imzml">our instructions</a> for converting datasets into this format. If you are experiencing difficulties, please contact your instrument vendor.</p>

          <p><b>Step-by-step tutorial:</b> Please read our <a href="https://www.slideshare.net/Metaspace2020/metaspace-training-course-ourcon-v-2017">training guide slides</a> providing an introduction to METASPACE as well as a step-by-step tutorial with screenshots.</p>

          <p><b>Questions or requests?</b> Please email us at <a href="mailto:contact@metaspace2020.eu">contact@metaspace2020.eu</a>. Also, we are always happy to receive your feedback, both positive and negative.</p>

          <p>To start the submission, just drop the files into the box below, fill in the metadata form, and click the Submit button.</p>
          <p>Have fun using METASPACE!</p>
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
                       disabledSubmitMessage="Your files must be uploaded first">
      </metadata-editor>
    </div>
  </div>
</template>

<script>
 // TODO: try https://github.com/FineUploader/vue-fineuploader once it's ready for production

 import FineUploader from './FineUploader.vue';
 import FilterPanel from './FilterPanel.vue';
 import MetadataEditor from './MetadataEditor.vue';
 import Vue from 'vue';

 import * as config from '../clientConfig.json';
 import {getJWT, pathFromUUID} from '../util';
 import {submitDatasetQuery} from '../api/dataset';

 export default {
   name: 'upload-page',
   created() {
     this.$store.commit('updateFilter', this.$store.getters.filter);
   },
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
       enableUploads: config.enableUploads
     }
   },
   components: {
     FineUploader,
     MetadataEditor,
     FilterPanel
   },
   methods: {
     onUpload(filenames) {
       const targetFileExt = '.mzml';
       const files = filenames.filter(f => f.toLowerCase().endsWith(targetFileExt))[0];
       Vue.nextTick(() => {
         this.$refs.editor.suggestDatasetName(files.slice(0, files.length - targetFileExt.length));
       });
     },

     onSuccess(filenames) {
       this.enableSubmit = true;
     },

     onFailure(failedFiles) {
       console.log(failedFiles);
     },

     onFormSubmit(_, formData) {
       const uuid = this.$refs.uploader.getUUID();
       this.submitDataset(uuid, formData).then(() => {
         this.enableSubmit = false;

         this.$refs.uploader.reset();
         this.$refs.editor.resetDatasetName();
         this.$message({
           message: 'Your dataset was successfully submitted!',
           type: 'success'
         });
       }).catch(err => {
         console.log(err.message);
         this.$message({
           message: 'Metadata submission failed :( Contact us: contact@metaspace2020.eu',
           type: 'error',
           duration: 0,
           showClose: true
         })
       })
     },

     submitDataset(uuid, formData) {
       console.log("submitting " + uuid);
       return getJWT()
         .then(jwt => this.$apollo.mutate({
           mutation: submitDatasetQuery,
           variables: {
             path: pathFromUUID(uuid),
             value: formData,
             jwt
           }}))
         .then(resp => resp.data.submitDataset)
         .then(status => {
           if (status != 'success')
             throw new Error(status);
           return status;
         });
     }
   }
 }
</script>

<style>
 #instructions {
   padding-left: 5px;
 }

 #filter-panel-container > * {
   padding-left: 0;
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
</style>
