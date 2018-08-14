<template>
  <div class="main-content">
    <div class="upload-page-wrapper">
      <div v-if="!enableUploads">
        <div id="maintenance-message">
          Uploading is temporarily disabled so that we can safely update the website.
          <br/>
          Please wait a few hours and reload the page. Thank you for understanding!
        </div>
      </div>

      <div v-else-if="!isSignedIn">
        <div id="sign-in-intro">
          <intro-message>
            <p class="sign-in-message"><b>To get started, click "Sign in" to sign in or create an account.</b></p>
          </intro-message>
        </div>
      </div>

      <div v-else>
        <div id="upload-left-pane">
          <!--Uncomment below when LCMS support is needed-->
          <!--<div id="filter-panel-container">-->
            <!--<filter-panel level="upload"></filter-panel>-->
          <!--</div>-->

          <div class="fine-uploader-wrapper">
            <fine-uploader :config="fineUploaderConfig"
                           :dataTypeConfig="fineUploaderDataTypeConfig"
                           ref="uploader"
                           style="flex-basis: 90%"
                           @upload="onUpload" @success="onUploadSuccess" @failure="onUploadFailure" />
            <div class="md-editor-submit">
               <el-button type="primary" v-if="enableSubmit" @click="onSubmit" class="el-button__metadata">Submit</el-button>
                <el-button v-else type="primary" disabled :title="disabledSubmitMessage" class="el-button__metadata">Submit</el-button>
            </div>
          </div>
        </div>

        <div id="upload-right-pane">
          <metadata-editor ref="editor"
                           :enableSubmit="uploadedUuid != null && !isSubmitting"
                           :validationErrors="validationErrors">
          </metadata-editor>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
 // TODO: try https://github.com/FineUploader/vue-fineuploader once it's ready for production

 import FineUploader from './FineUploader.vue';
 import FilterPanel from './FilterPanel.vue';
 import MetadataEditor from './MetadataEditor/MetadataEditor.vue';
 import IntroMessage from './IntroMessage.vue';
 import Vue from 'vue';
 import tokenAutorefresh from '../tokenAutorefresh';

 import * as config from '../clientConfig.json';
 import {pathFromUUID} from '../util';
 import {createDatasetQuery} from '../api/dataset';

 const DataTypeConfig = {
   'LC-MS': {
     fileExtensions: ['mzML'],
     maxFiles: 1,
     nameValidator(fileNames) {
       return fileNames.length === 1;
     }
   },
   default: {
     fileExtensions: ['imzML', 'ibd'],
     maxFiles: 2,
     nameValidator(fileNames) {
       if (fileNames.length < 2) {
         return false;
       }

       const basename = fname => fname.split('.').slice(0, -1).join('.');
       const extension = fname => fname.split('.').slice(-1)[0];

       // consider only the last two selected files
       const fileCount = fileNames.length;
       let [first, second] = [fileNames[fileCount - 2], fileNames[fileCount - 1]];
       let [fext, sext] = [first, second].map(extension);
       let [fbn, sbn] = [first, second].map(basename);
       if (fext === sext || fbn !== sbn) {
         this.$message({
           message: "Incompatible file names! Please select 2 files " +
                    "with the same name but different extension",
           type: 'error'
         });
         return false;
       }
       return true;
     }
   }
 };

 export default {
   name: 'upload-page',
   created() {
     this.$store.commit('updateFilter', this.$store.getters.filter);
   },

   async mounted() {
     const {query} = this.$store.state.route;
     if (query['first-time'] !== undefined)
       this.introIsHidden = false;

     await tokenAutorefresh.waitForAuth();
     if (!this.isSignedIn && this.features.newAuth) {
       this.$store.commit('account/showDialog', {
         dialog: 'signIn',
         dialogCloseRedirect: '/',
         loginSuccessRedirect: '/upload',
       });
     }
   },

   data() {
     return {
       fineUploaderConfig: config.fineUploader,
       enableUploads: config.enableUploads,
       validationErrors: [],
       isSubmitting: false,
       uploadedUuid: null,
       features: config.features
     }
   },
   components: {
     FineUploader,
     MetadataEditor,
     FilterPanel,
     IntroMessage
   },
   computed: {
	   disabledSubmitMessage(){
	     return "Your files must be uploaded first"
     },

     enableSubmit(){
     	return this.uploadedUuid != null && !this.isSubmitting;
     },

     fineUploaderDataTypeConfig() {
       const activeDataType = this.$store.getters.filter.metadataType;
       return (activeDataType in DataTypeConfig) ? DataTypeConfig[activeDataType] : DataTypeConfig['default'];
     },
     isSignedIn() {
       return this.$store.state.authenticated;
     }
   },

   methods: {
   	 onSubmit() {
       let queryRes = this.$refs.editor.getFormValueForSubmit();
       if (queryRes !== undefined) {
       console.log(queryRes.metaspaceOptions)
       this.onFormSubmit(
         queryRes.datasetId,
         queryRes.metadataJson,
         queryRes.metaspaceOptions)
       }
     },

     onUpload(filenames) {
       const allowedExts = this.fineUploaderDataTypeConfig.fileExtensions.map(ext => `.${ext.toLowerCase()}`);
       let fileName = '';
       let fileExt = '';
       for (const ext of allowedExts) {
         for (const f of filenames) {
           if (f.toLowerCase().endsWith(ext)) {
             fileName = f;
             fileExt = ext;
             break;
           }
         }
       }
       if (!fileName || !fileExt) {
         throw new Error('Missing fileName/fileExt');
       }
       const dsName = fileName.slice(0, fileName.length - fileExt.length);
       Vue.nextTick(() => {
         this.$refs.editor.fillDatasetName(dsName);
       });
     },

     onUploadSuccess(uuid) {
       this.uploadedUuid = uuid;
     },

     onUploadFailure() {
       this.uploadedUuid = null;
     },

     async onFormSubmit(_, metadataJson, metaspaceOptions) {
       // Prevent duplicate submissions if user double-clicks
       if (this.isSubmitting) return;
       this.isSubmitting = true;

       try {
         await this.$apollo.mutate({
           mutation: createDatasetQuery,
           variables: {
             input: {
               inputPath: pathFromUUID(this.uploadedUuid),
               metadataJson,
               ...metaspaceOptions,
             }
           }
         });

         this.uploadedUuid = null;
         this.validationErrors = [];
         this.$refs.uploader.reset();
         this.$refs.editor.resetAfterSubmit();
         this.$message({
           message: 'Your dataset was successfully submitted!',
           type: 'success'
         });
       } catch (err) {
         let graphQLError = null;
         try {
           graphQLError = JSON.parse(err.graphQLErrors[0].message);
         } catch(err2) { /* The case where err does not contain a graphQL error is handled below */ }

         if (graphQLError && graphQLError.type === 'failed_validation') {
           this.validationErrors = graphQLError['validation_errors'];
           this.$message({
             message: 'Please fix the highlighted fields and submit again',
             type: 'error'
           });
         } else if (graphQLError && graphQLError.type === 'wrong_moldb_name') {
           this.$refs.editor.resetMetaboliteDatabase();
           this.$message({
             message: 'An unrecognized metabolite database was selected. This field has been cleared, ' +
             'please select the databases again and resubmit the form.',
             type: 'error'
           });
         } else {
           this.$message({
             message: 'There was an unexpected problem submitting the dataset. Please refresh the page and try again.'
               + 'If this problem persists, please contact us at '
               + '<a href="mailto:contact@metaspace2020.eu">contact@metaspace2020.eu</a>',
             dangerouslyUseHTMLString: true,
             type: 'error',
             duration: 0,
             showClose: true
           });
           throw err;
         }
       } finally {
         this.isSubmitting = false;
       }
     },

	   cancel() {
		   this.$router.go(-1);
	   },
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

 #upload-left-pane {
   flex-grow: 1;
   max-width: 950px;
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

  #sign-in-intro {
    padding: 20px;
  }
  .sign-in-message {
    margin: 1.5em 0;
    font-size: 1.5em;
  }

 .upload-page-wrapper {
   max-width: 950px;
 }

 .main-content {
   padding: 80px 20px 20px 20px;
   display: flex;
   justify-content: center;
 }

 .md-editor-submit {
   display: flex;
   flex-direction: column;
   justify-content: center;
 }

 .el-button__metadata {
   margin: auto 0;
   padding: 20px 20px;
   font-size: 150%;
 }

 .fine-uploader-wrapper {
   display: flex;
   flex-direction: row;
   justify-content: space-evenly;
 }
</style>
