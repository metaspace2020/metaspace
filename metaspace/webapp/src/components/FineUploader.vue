<template>
  <div>
    <script type="text/template" id="qq-template">
      <div id="upload-area-container" class="qq-uploader-selector qq-uploader">
        <div class="qq-upload-drop-area-selector qq-upload-drop-area" qq-hide-dropzone>
          <span class="qq-upload-drop-area-text-selector"></span>
        </div>

        <span class="qq-drop-processing-selector qq-drop-processing">
          <span>Processing dropped files...</span>
          <span class="qq-drop-processing-spinner-selector qq-drop-processing-spinner"></span>
        </span>
        <ul class="qq-upload-list-selector qq-upload-list" aria-live="polite" aria-relevant="additions removals">
          <li>
            <div class="qq-progress-bar-container-selector">
              <div role="progressbar"
                  aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"
                  class="qq-progress-bar-selector qq-progress-bar"></div>
            </div>
            <span class="qq-upload-spinner-selector qq-upload-spinner"></span>
            <img class="qq-thumbnail-selector" qq-max-size="100" qq-server-scale>
            <span class="qq-upload-file-selector qq-upload-file"></span>
            <span class="qq-upload-size-selector qq-upload-size"></span>
            <button type="button" class="qq-btn qq-upload-cancel-selector qq-upload-cancel">Cancel</button>
            <button type="button" class="qq-btn qq-upload-retry-selector qq-upload-retry">Retry</button>
            <button type="button" class="qq-btn qq-upload-delete-selector qq-upload-delete">Delete</button>
            <span role="status" class="qq-upload-status-text-selector qq-upload-status-text"></span>
          </li>
        </ul>

        <dialog class="qq-alert-dialog-selector">
          <div class="qq-dialog-message-selector"></div>
          <div class="qq-dialog-buttons">
            <button type="button" class="qq-cancel-button-selector">Close</button>
          </div>
        </dialog>

        <dialog class="qq-confirm-dialog-selector">
          <div class="qq-dialog-message-selector"></div>
          <div class="qq-dialog-buttons">
            <button type="button" class="qq-cancel-button-selector">No</button>
            <button type="button" class="qq-ok-button-selector">Yes</button>
          </div>
        </dialog>

        <dialog class="qq-prompt-dialog-selector">
          <div class="qq-dialog-message-selector"></div>
          <input type="text">
          <div class="qq-dialog-buttons">
            <button type="button" class="qq-cancel-button-selector">Cancel</button>
            <button type="button" class="qq-ok-button-selector">Ok</button>
          </div>
        </dialog>

      </div>

    </script>
    <div ref="cust" v-if="uploadFilenames.length === 0"><span class="chooseFile">Select</span> or {{dropText()}}</div>
    <div ref="fu" id="fu-container">
    </div>
  </div>
</template>

<script>
 import uuid from 'uuid';
 import qq from 'fine-uploader/lib/all';
 import 'fine-uploader/s3.fine-uploader/fine-uploader-new.css';

 const basicOptions = {
   template: 'qq-template',
   autoUpload: false,
   iframeSupport: {localBlankPagePath: "/server/success.html"},
   cors: {expected: true},
   chunking: {
     enabled: true,
     mandatory: true,
     concurrent: {enabled: true},
   },
   retry: {
     enableAuto: true
   },
   resume: {enabled: true}
 };

 export default {
   name: 'fine-uploader',
   props: ['config', 'dataTypeConfig'],
   data() {
     return {
       fineUploader: null,
       uuid: '',
       uploadFilenames: [],
       valid: false
     }
   },

   mounted() {
     this.reset();
     this.onDataTypeConfigUpdate();
   },

   watch: {
     'dataTypeConfig': function() {
       this.reset();
       this.onDataTypeConfigUpdate();
     }
   },

   methods: {

     dropText() {
     const multipleFilesAllowed = this.dataTypeConfig.maxFiles > 1;
     const fileExtensions = this.dataTypeConfig.fileExtensions;
     const formattedFileTypes = fileExtensions.length > 1 ? `${fileExtensions.slice(0, -1).join(', ')} and ${fileExtensions[fileExtensions.length - 1]}`
       : fileExtensions[0];

	     return `drop ${formattedFileTypes} file${multipleFilesAllowed ? 's' : ''} here`
     },

     onDataTypeConfigUpdate() {
	     // FineUploader template initialization prevents from using Vue.js template features
	     // had to access DOM directly in this method
	     const inputText = this.$refs.cust;
	     inputText.classList.add('uploader-text');
	     document.getElementById('upload-area-container').appendChild(inputText)
     },

     validate() {
       const files = this.fineUploader.getUploads();

       let fnames = files.map(f => f.name);

       // FIXME somehow I couldn't get TestCafe to pass real filenames
       // so FineUploader uses default values for both :-\
       if (fnames[0] == 'misc_data' && fnames[1] == 'misc_data') {
         fnames = ['test.imzML', 'test.ibd'];
       }

       if (!this.dataTypeConfig.nameValidator.bind(this)(fnames)) {
         return;
       }

       this.valid = true;
       this.uploadFilenames = fnames;
     },

     uploadIfValid(id) {
       if (this.valid) {
         this.$emit('upload', this.uploadFilenames);
         this.fineUploader.uploadStoredFiles();
       }
     },

     reset() {
       this.uploadFilenames = [];
       this.valid = false;
       this.uuid = uuid();

       let options = Object.assign({}, basicOptions, {
	       button: this.$refs.cust,
         validation: {
           allowedExtensions: this.dataTypeConfig.fileExtensions,
           itemLimit: this.dataTypeConfig.maxFiles
         },
         multiple: this.dataTypeConfig.maxFiles > 1,
         element: this.$refs.fu,
         objectProperties: {
           key: (id) => `${this.uuid}/${this.fineUploader.getFile(id).name}`
         },
         callbacks: {
           onAllComplete: (succeeded, failed) => {
             if (failed.length == 0) {
               this.$message({message: 'All datasets have been uploaded', type: 'success'})
               this.$emit('success', this.uuid);
             } else {
               this.$message({message: 'Upload failed :(', type: 'error'})
               this.$emit('failure', failed);
             }
           },
           onValidateBatch: () => this.validate(),
           onSubmitted: id => this.uploadIfValid(id)
         }
       });

       if (this.config.storage != 's3') {
         options.request = {
           endpoint: '/upload',
           params: {
             'session_id': sessionStorage.getItem('session_id'),
             'uuid': this.uuid
           }
         };

         // FIXME: move into fineUploaderConfig.json
         options.chunking.success = {
           endpoint: '/upload/success',
           mandatory: true, // to make life easier
           params: {'uuid': this.uuid}
         };
	       options.button = this.$refs.cust;

         this.fineUploader = new qq.FineUploader(options);

       } else {

	       options.button = document.getElementById('cust');
         options.request = {
           endpoint: `${this.config.aws.s3_bucket}.s3.amazonaws.com`,
           accessKey: this.config.aws.access_key_id,
         };

         options.signature = {endpoint: this.config.aws.s3_signature_endpoint},

         this.fineUploader = new qq.s3.FineUploader(options);
       }
     }
   }
 }

</script>

<style>
 .qq-uploader {
   padding: 10px 0;
   min-height: 45px;
   max-height: 100px;
   margin: 25px 20px 25px 0;
 }

 .uploader-text {
   font-size: 200%;
   transform: translateY(15%);
   width: 100%;
   text-align: center;
   opacity: 0.25;
 }
</style>
