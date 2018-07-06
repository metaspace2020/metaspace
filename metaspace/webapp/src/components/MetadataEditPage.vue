<template>
  <metadata-editor ref="editor"
                   :datasetId="datasetId"
                   :enableSubmit="loggedIn && !isSubmitting"
                   @submit="onSubmit"
                   disabledSubmitMessage="You must be logged in to perform this operation"
                   :validationErrors="validationErrors">
  </metadata-editor>
</template>

<script>
 import MetadataEditor from './MetadataEditor/MetadataEditor.vue';
 import {updateDatasetQuery} from '../api/metadata';

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
     async onSubmit(datasetId, metadataJson, metaspaceOptions) {
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
           this.$router.go(-1);
         }
       } catch(e) {
         // Empty catch block needed because babel-plugin-component throws a
         // compilation error when an async function has a try/finally without a catch.
         // https://github.com/ElementUI/babel-plugin-component/issues/9
         throw e;
       } finally {
         this.isSubmitting = false;
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
           fetchMetadataQuery: (prev, _) => ({
             ...prev,
             metadataJson,
             ...metaspaceOptions
           })
         }
       });
     }
   }
 }
</script>
