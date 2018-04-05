<template>
  <metadata-editor :datasetId="datasetId"
                   :enableSubmit="loggedIn"
                   @submit="onSubmit"
                   disabledSubmitMessage="You must be logged in to perform this operation"
                   v-bind:validationErrors="validationErrors">
  </metadata-editor>
</template>

<script>
 import MetadataEditor from './MetadataEditor.vue';
 import {getJWT} from '../util';
 import {updateMetadataQuery} from '../api/metadata';

 export default {
   name: 'metadata-edit-page',
   data() {
     return {
       validationErrors: []
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
     safelyParseJSON(json) {
       let parseRes;
       try {
         parseRes = JSON.parse(json);
       } catch (err) {
         console.log(err.message);
         return 'failed_parsing';
       }
       return parseRes;
     },

     onSubmit(datasetId, value) {
       getJWT().then(jwt => this.updateMetadata(jwt, datasetId, value))
               .then(() => {
                 this.validationErrors = [];
                 this.$message({
                   message: 'Metadata was successfully updated!',
                   type: 'success'
                 });
                 this.$router.go(-1);
               }).catch(err => {
                  console.log(err);
                    if (err.message === 'failed_validation') {
                      this.$message({
                      message: 'Please fix the highlighted fields and submit again',
                      type: 'error'
                      });
                    } else {
                      this.$message({message: 'Couldn\'t save the form: ' + err.message, type: 'error'})
                    }
               });
     },

     updateMetadata(jwt, dsId, value) {
       return this.$apollo.mutate({
         mutation: updateMetadataQuery,
         variables: {jwt, dsId, value},
         updateQueries: {
           fetchMetadataQuery: (prev, _) => ({
             dataset: {
               metadataJSON: JSON.stringify(value)
             }
           })
         }
       }).then(resp => resp.data.updateMetadata)
         .then(status => {
           if (status != 'success') {
             let parsedStatus = this.safelyParseJSON(status);
             if (parsedStatus == 'failed_parsing') {
               throw new Error('failed_parsing');
             } else if (parsedStatus[0] === 'failed_validation') {
               this.validationErrors = parsedStatus[1];
               throw new Error(parsedStatus[0]);
             }
             throw new Error(status);
           }
           return status;
         })
     }
   }
 }
</script>
