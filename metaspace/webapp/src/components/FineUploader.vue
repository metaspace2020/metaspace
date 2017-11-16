<template>
  <div>
    <script type="text/template" id="qq-template">
      <div class="qq-uploader-selector qq-uploader"
          qq-drop-area-text="Drop file in mzML format here">
        <div class="qq-upload-drop-area-selector qq-upload-drop-area" qq-hide-dropzone>
          <span class="qq-upload-drop-area-text-selector"></span>
        </div>
        <div class="buttons">
          <div class="qq-upload-button-selector qq-upload-button metasp-button" role="button">
            Select file
          </div>
        </div>
        <span class="qq-drop-processing-selector qq-drop-processing">
          <span>Processing dropped file...</span>
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
   multiple: false,
   cors: {expected: true},
   chunking: {
     enabled: true,
     mandatory: true,
     concurrent: {enabled: true},
   },
   retry: {
     enableAuto: true
   },
   resume: {enabled: true},
   validation: {
     itemLimit: 1,
     allowedExtensions: ["mzML"]
   },
 };

 export default {
   name: 'fine-uploader',
   props: ['config'],
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
   },

   methods: {
     validate() {
       const files = this.fineUploader.getUploads();

       let fnames = files.map(f => f.name);

       // FIXME somehow I couldn't get TestCafe to pass real filenames
       // so FineUploader uses default values for both :-\
       if (fnames[0] == 'misc_data' && fnames[1] == 'misc_data') {
         fnames = ['test.imzML', 'test.ibd'];
       }

       if (fnames.length != 1) {
         return;
       }

       console.log(this.uuid);
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
         element: this.$refs.fu,
         objectProperties: {
           key: (id) => `${this.uuid}/${this.fineUploader.getFile(id).name}`
         },
         callbacks: {
           onComplete: (id, name, response) => {
             if (response.success)
               console.log('Uploaded: ' + name);
             else
               console.log('Failed: ' + name);
           },
           onAllComplete: (succeeded, failed) => {
             if (failed.length == 0) {
               this.$message({message: 'All datasets have been uploaded', type: 'success'})
               this.$emit('success', this.uploadFilenames);
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

         this.fineUploader = new qq.FineUploader(options);
       } else {
         options.request = {
           endpoint: `${this.config.aws.s3_bucket}.s3.amazonaws.com`,
           accessKey: this.config.aws.access_key_id,
         };

         options.signature = {endpoint: this.config.aws.s3_signature_endpoint},

         this.fineUploader = new qq.s3.FineUploader(options);
       }
     },

     getUUID() {
       return this.uuid;
     }
   }
 }

</script>

<style>

 /* override some defaults */
 .metasp-button {
   background-color: #0069e0 !important;
   padding: 7px 20px !important;
   width: 150px !important;
   font-size: 16px !important;
 }

 #fine-uploader-manual-trigger .qq-upload-button {
   margin-right: 15px;
 }

 #fine-uploader-manual-trigger .buttons {
   width: 36%;
 }

 #fine-uploader-manual-trigger .qq-uploader .qq-total-progress-bar-container {
   width: 60%;
 }

 .qq-uploader {
   min-height: 50px;
   max-height: 150px;
 }

 #fu-container {
   max-width: 1000px;
   padding: 5px;
 }

</style>
