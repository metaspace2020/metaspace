<template>
  <metadata-editor :datasetId="datasetId"
                   :enableSubmit="loggedIn"
                   @submit="onSubmit"
                   disabledSubmitMessage="You must be logged in to perform this operation">
  </metadata-editor>
</template>

<script>
 import MetadataEditor from './MetadataEditor.vue';
 import {getJWT} from '../util';
 import {updateMetadataQuery} from '../api/metadata';

 export default {
   name: 'metadata-edit-page',
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
     onSubmit(datasetId, value) {
       getJWT().then(jwt => this.updateMetadata(jwt, datasetId, value))
               .then(() => {
                 this.$message({
                   message: 'Metadata was successfully updated!',
                   type: 'success'
                 });
                 this.$router.go(-1);
               }).catch(err => {
                 console.log(err);
                 this.$message({message: 'Couldn\'t save the form: ' + err.message, type: 'error'})
               });
     },

     updateMetadata(jwt, dsId, value) {
       const dsName = JSON.parse(value).metaspace_options.Dataset_Name;
       return this.$apollo.mutate({
         mutation: updateMetadataQuery,
         variables: {jwt, dsId, dsName, value},
         updateQueries: {
           fetchMetadataQuery: (prev, _) => ({
             dataset: {
               metadataJSON: JSON.stringify(value)
             }
           })
         }
       }).catch( e => {
         throw Error('GraphQL error');
       });
     }
   }
 }
</script>
