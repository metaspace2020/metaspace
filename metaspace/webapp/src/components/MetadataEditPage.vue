<template>
  <metadata-editor :datasetId="datasetId"
                   :enableSubmit="loggedIn"
                   @submit="onSubmit"
                   disabledSubmitMessage="You must be logged in to perform this operation">
  </metadata-editor>
</template>

<script>
 import MetadataEditor from './MetadataEditor.vue';
 import gql from 'graphql-tag';
 import {getJWT} from '../util.js';

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
               }).catch(err =>
                 this.$message({message: 'Couldn\'t save the form: ' + err.message, type: 'error'})
               );
     },

     updateMetadata(jwt, dsId, value) {
       return this.$apollo.mutate({
         mutation: gql`mutation ($jwt: String!, $dsId: String!, $value: String!) {
           updateMetadata(jwt: $jwt, datasetId: $dsId, metadataJson: $value)
         }`,
         variables: {jwt, dsId, value}
       }).then(resp => resp.data.updateMetadata)
         .then(status => {
           if (status != 'success')
             throw new Error(status);
         });
     }
   }
 }
</script>
