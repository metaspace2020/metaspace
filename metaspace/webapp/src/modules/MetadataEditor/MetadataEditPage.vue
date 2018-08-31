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

 export default {
   name: 'metadata-edit-page',
   data() {
     return {
       validationErrors: [],
       isSubmitting: false
     }
   },
   computed: {
     datasetId() {
       return this.$store.state.route.params.dataset_id;
     },

     loggedIn() {
       return this.$store.state.authenticated;
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
         const { datasetId, metadataJson, metaspaceOptions } = formValue;
         // Prevent duplicate submissions if user double-clicks
         if (this.isSubmitting) return;
         this.isSubmitting = true;

         try {
           const wasSaved = await this.saveDataset(datasetId, metadataJson, metaspaceOptions);

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
     async saveDataset(datasetId, metadataJson, metaspaceOptions) {
       // TODO Lachlan: This is similar to the logic in UploadPage.vue. Refactor this when these components are in JSX
       try {
         await this.updateOrReprocess(datasetId, metadataJson, metaspaceOptions, false);
         return true;
       } catch (err) {
         let graphQLError = null;
         try {
           graphQLError = JSON.parse(err.graphQLErrors[0].message);
         } catch(err2) { /* The case where err does not contain a graphQL error is handled below */ }

         if (graphQLError
           && (graphQLError['type'] === 'reprocessing_needed')) {
           if (await this.confirmReprocess()) {
             return await this.updateOrReprocess(datasetId, metadataJson, metaspaceOptions, true);
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

     async updateOrReprocess(datasetId, metadataJson, metaspaceOptions, reprocess) {
       return await this.$apollo.mutate({
         mutation: updateDatasetQuery,
         variables: {
           id: datasetId,
           input: {
             metadataJson: metadataJson,
             ...metaspaceOptions
           },
           reprocess: reprocess
         },
         updateQueries: {
           fetchMetadataQuery: (prev, _) => {
             const {groupId, ...options} = metaspaceOptions;
             return {
               ...prev,
               metadataJson,
               group: groupId ? {id: groupId} : null,
               ...options
             }
           }
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
