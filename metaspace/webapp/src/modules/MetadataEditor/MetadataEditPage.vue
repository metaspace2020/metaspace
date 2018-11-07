<template>
  <div class="page">
    <div class="content">
      <div class="button-bar">
        <el-button @click="handleCancel">Cancel</el-button>
        <el-button
          type="primary"
          :disabled="!loggedIn || isSubmitting"
          :title="loggedIn ? undefined : 'You must be logged in to perform this operation'"
          @click="handleSubmit">
          Submit
        </el-button>
      </div>
      <metadata-editor ref="editor"
                       :datasetId="datasetId"
                       :validationErrors="validationErrors">
      </metadata-editor>
    </div>
  </div>
</template>

<script>
 import MetadataEditor from './MetadataEditor.vue';
 import {updateDatasetQuery} from '../../api/metadata';
 import { getSystemHealthQuery, getSystemHealthSubscribeToMore } from '../../api/system';
 import {isArray, isEqual, get} from 'lodash-es';
 import {currentUserRoleQuery} from '../../api/user';

 export default {
   name: 'metadata-edit-page',
   data() {
     return {
       validationErrors: [],
       isSubmitting: false,
       systemHealth: null,
       currentUser: null,
     }
   },
   apollo: {
     systemHealth: {
       query: getSystemHealthQuery,
       subscribeToMore: getSystemHealthSubscribeToMore,
       fetchPolicy: 'cache-first',
     },
     currentUser: {
       query: currentUserRoleQuery,
       fetchPolicy: 'cache-first',
     }
   },
   computed: {
     datasetId() {
       return this.$store.state.route.params.dataset_id;
     },

     loggedIn() {
       return this.currentUser != null && this.currentUser.id != null;
     }
   },
   components: {
     MetadataEditor
   },

   methods: {
     handleCancel() {
       this.$router.push('/datasets');
     },
     async handleSubmit() {
       const formValue = this.$refs.editor.getFormValueForSubmit();

       if (formValue != null) {
         const { datasetId, metadataJson, metaspaceOptions, initialMetadataJson, initialMetaspaceOptions } = formValue;
         // Prevent duplicate submissions if user double-clicks
         if (this.isSubmitting) return;
         this.isSubmitting = true;

         const payload = {};
         // Only include changed fields in payload
         if (metadataJson !== initialMetadataJson) {
           payload.metadataJson = metadataJson;
         }
         Object.keys(metaspaceOptions).forEach(key => {
           const oldVal = initialMetaspaceOptions[key];
           const newVal = metaspaceOptions[key];
           // For arrays (molDBs, adducts, projectIds) ignore changes in order
           if (isArray(oldVal) && isArray(newVal) ? !isEqual(oldVal.slice().sort(), newVal.slice().sort()) : !isEqual(oldVal, newVal)) {
             payload[key] = newVal;
           }
         });

         try {
           const wasSaved = await this.saveDataset(datasetId, payload);

           if (wasSaved) {
             this.validationErrors = [];
             this.$message({
               message: 'Metadata was successfully updated!',
               type: 'success'
             });
             this.$router.push('/datasets');
           }
         } catch (e) {
           // Empty catch block needed because babel-plugin-component throws a
           // compilation error when an async function has a try/finally without a catch.
           // https://github.com/ElementUI/babel-plugin-component/issues/9
           throw e;
         } finally {
           this.isSubmitting = false;
         }
       }
     },
     async saveDataset(datasetId, payload, options = {}) {
       // TODO Lachlan: This is similar to the logic in UploadPage.vue. Refactor this when these components are in JSX
       try {
         await this.updateOrReprocess(datasetId, payload, options);
         return true;
       } catch (err) {
         let graphQLError = null;
         try {
           graphQLError = JSON.parse(err.graphQLErrors[0].message);
         } catch (err2) { /* The case where err does not contain a graphQL error is handled below */ }

         if (get(err, 'graphQLErrors[0].isHandled')) {
           return false;
         } else if (graphQLError && (graphQLError['type'] === 'reprocessing_needed')) {
           if (this.systemHealth && (!this.systemHealth.canProcessDatasets || !this.systemHealth.canMutate)) {
             this.$alert(`Changes to the analysis options require that this dataset be reprocessed; however,
             dataset processing has been temporarily suspended so that we can safely update the website.\n\n
             Please wait a few hours and try again.`,
               'Dataset processing suspended',
               { type: 'warning' });
             return false;
           } else if (await this.confirmReprocess()) {
             return await this.saveDataset(datasetId, payload, {...options, reprocess: true});
           }
         } else if (graphQLError && graphQLError.type === 'wrong_moldb_name') {
           this.$refs.editor.resetMetaboliteDatabase();
           this.$message({
             message: 'An unrecognized metabolite database was selected. This field has been cleared. ' +
               'Please select the databases again and resubmit the form.',
             type: 'error'
           });
         } else if (graphQLError && graphQLError['type'] === 'failed_validation') {
           this.validationErrors = graphQLError['validation_errors'];
           if (this.currentUser && this.currentUser.role === 'admin' && await this.confirmSkipValidation()) {
             return await this.saveDataset(datasetId, payload, {...options, skipValidation: true});
           }
           this.$message({
             message: 'Please fix the highlighted fields and submit again',
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
         return false;
       }
     },

     async confirmReprocess() {
       try {
         await this.$confirm('The changes to the analysis options require the dataset to be reprocessed. ' +
           'This dataset will be unavailable until reprocessing has completed. Do you wish to continue?',
           'Reprocessing required',
           {
             type: 'warning',
             confirmButtonText: 'Continue',
             cancelButtonText: 'Cancel'
           });
         return true;
       } catch (e) {
         // Ignore - user clicked cancel
         return false;
       }
     },

     async confirmSkipValidation() {
       try {
         await this.$confirm('There were validation errors. Save anyway?',
           'Validation errors',
           {
             type: 'warning',
             confirmButtonText: 'Continue',
             cancelButtonText: 'Cancel'
           });
         return true;
       } catch (e) {
         // Ignore - user clicked cancel
         return false;
       }
     },

     async updateOrReprocess(datasetId, payload, options) {
       return await this.$apollo.mutate({
         mutation: updateDatasetQuery,
         variables: {
           id: datasetId,
           input: payload,
           ...options,
         }
       });
     }
   }
 }
</script>
<style scoped lang="scss">
  .page {
    display: flex;
    justify-content: center;
    margin-top: 25px;
  }
  .content {
    width: 950px;
  }
  .button-bar {
    display: flex;
    justify-content: flex-end;
    > button {
      width: 100px;
      padding: 6px;
    }
  }
</style>
