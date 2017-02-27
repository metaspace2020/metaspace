<template>
  <div id="upload-page">
    <div id="upload-left-pane">
      <div id="instructions">
        <p>Welcome to the upload interface for the <a href="http://metaspace2020.eu">METASPACE</a> annotation engine!</p>
        <p>
          Datasets can be uploaded in the <a href="http://imzml.org">imzML</a> format as <b>centroided</b> spectra.
          Please check out our <a href="http://metaspace2020.eu/imzml">instructions</a> for converting datasets into this format:
          If you are experiencing difficulties in the conversion, please contact your instrument vendor.
        </p>
        <p>After processing your annotations will be visible online through our <a href="/#/annotations">results browsing interface</a>.</p>
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
 import MetadataEditor from './MetadataEditor.vue';
 import Vue from 'vue';
 import gql from 'graphql-tag';

 import fineUploaderConfig from '../fineUploaderConfig.json';
 import {pathFromUUID} from '../util.js';

 export default {
   name: 'upload-page',
   data() {
     return {
       fineUploaderConfig,
       enableSubmit: false
     }
   },
   components: {
     FineUploader,
     MetadataEditor
   },
   methods: {
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

     onFormSubmit(_, formData) {
       const uuid = this.$refs.uploader.getUUID();
       this.submitDataset(uuid, formData).then(() => {
         this.enableSubmit = false;

         this.$refs.uploader.reset();
         this.$message({
           message: 'Your dataset was successfully submitted!',
           type: 'success'
         });
       }).catch(err => {
         console.log(err.message);
         this.$message({
           message: 'Metadata submission failed :( Contact us: alexandrov-group@embl.de',
           type: 'error',
           duration: 0,
           showClose: true
         })
       })
     },

     submitDataset(uuid, formData) {
       console.log("submitting " + uuid);
       return this.$apollo.mutate({
         mutation: gql`mutation ($path: String!, $value: String!) {
           submitDataset(path: $path, metadataJson: $value)
         }`,
         variables: {path: pathFromUUID(uuid), value: formData}
       }).then(resp => resp.data.submitDataset)
         .then(status => {
           if (status != 'success')
             throw new Error(status);
         });
     }
   }
 }
</script>

<style>
 #instructions {
 }

 #upload-page {
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
</style>
