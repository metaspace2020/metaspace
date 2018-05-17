<template>
  <metadata-editor :datasetId="datasetId"
                   :enableSubmit="loggedIn && !isSubmitting"
                   @submit="onSubmit"
                   disabledSubmitMessage="You must be logged in to perform this operation"
                   v-bind:validationErrors="validationErrors">
  </metadata-editor>
</template>

<script>
 import MetadataEditor from './MetadataEditor.vue';
 import {getJWT} from '../util';
 import {resubmitDatasetQuery} from '../api/dataset';
 import {updateMetadataQuery} from '../api/metadata';

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
     async onSubmit(datasetId, value, isPublic) {
       // Prevent duplicate submissions if user double-clicks
       if (this.isSubmitting) return;
       this.isSubmitting = true;

       try {
         const jwt = await getJWT();
         const wasSaved = await this.saveDataset(jwt, datasetId, value, isPublic);

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
     async saveDataset(jwt, datasetId, value, isPublic)
     {
       try {
         await this.updateMetadata(jwt, datasetId, value, isPublic);
         return true;
       } catch (err) {
         if (err.graphQLErrors != null) {
           const graphQLError = JSON.parse(err.graphQLErrors[0].message);

           if ((graphQLError['type'] === 'submit_needed' || graphQLError['type'] === 'drop_submit_needed')) {
             if (await this.confirmReprocess()) {
               const delFirst = graphQLError['type'] === 'drop_submit_needed';
               await this.resubmitDataset(jwt, datasetId, value, isPublic, delFirst);
               return true;
             }
           } else if (graphQLError['type'] === 'failed_validation') {
             this.$message({
               message: 'Please fix the highlighted fields and submit again',
               type: 'error'
             });
           } else {
             this.$message({ message: 'Couldn\'t save the form: GraphQL error', type: 'error' });
           }
           return false;
         } else {
           throw err;
         }
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
     resubmitDataset(jwt, datasetId, metadataJson, isPublic, delFirst) {
       const name = JSON.parse(metadataJson).metaspace_options.Dataset_Name;
       return this.$apollo.mutate({
         mutation: resubmitDatasetQuery,
         variables: {jwt, datasetId, name, metadataJson, isPublic, delFirst},
         updateQueries: {
           fetchMetadataQuery: (prev, _) => ({
             dataset: {
               metadataJson: JSON.stringify(metadataJson),
               isPublic
             }
           })
         }
       });
     },
     updateMetadata(jwt, dsId, value, isPublic) {
       const dsName = JSON.parse(value).metaspace_options.Dataset_Name;
       return this.$apollo.mutate({
         mutation: updateMetadataQuery,
         variables: {jwt, dsId, dsName, value, isPublic},
         updateQueries: {
           fetchMetadataQuery: (prev, _) => ({
             dataset: {
               metadataJson: JSON.stringify(value),
               isPublic
             }
           })
         }
       });
     }
   }
 }
</script>
