<template>
  <div id="md-editor-container">
    <div style="position: relative;">
      <div id="md-editor-submit">
        <el-button @click="cancel">Cancel</el-button>
        <el-button type="primary" v-if="loggedIn" @click="submit">Submit</el-button>
        <el-button v-else type="primary" disabled title="You must be logged in to perform this operation">
          Submit
        </el-button>
      </div>

      <div id="md-section-list" v-loading="loading">

        <div class="metadata-section"
            v-for="(section, sectionName) in schema.properties">
          <div class="heading" v-html="prettify(sectionName)"></div>

          <el-form>
            <el-col :span="getWidth(propName)"
                v-for="(prop, propName) in section.properties">
              <div class="field-label" v-html="prettify(propName, section)"></div>

              <el-form-item class="control" v-if="prop.type == 'string'"
                            :class="isError(sectionName, propName)">
                <el-input v-if="!isFreeText(propName) && !prop.enum"
                          v-model="value[sectionName][propName]"
                          :required="isRequired(propName, section)"
                          :placeholder="prop.description">
                </el-input>

                <el-select v-if="!isFreeText(propName) && prop.enum"
                          :required="isRequired(propName, section)"
                          v-model="value[sectionName][propName]">
                  <el-option v-for="opt in prop.enum" :value="opt" :label="opt">
                  </el-option>
                </el-select>

                <el-input v-if="isFreeText(propName)"
                          type="textarea"
                          :required="isRequired(propName, section)"
                          v-model="value[sectionName][propName]"
                          :placeholder="prop.description">
                </el-input>

                <span class="error-msg" v-if="isError(sectionName, propName)">
                  {{ getErrorMessage(sectionName, propName) }}
                </span>
              </el-form-item>

              <div class="control" v-if="prop.type == 'object'" >
                <el-row>
                  <el-col :span="getWidth(fieldName)"
                          class="subfield"
                          v-for="(field, fieldName) in prop.properties">

                    <el-form-item :class="isError(sectionName, propName, fieldName)"
                                  :required="isRequired(fieldName, prop)">

                      <el-input v-if="field.type == 'string'"
                                v-model="value[sectionName][propName][fieldName]"
                                :placeholder="field.description">
                      </el-input>

                      <el-input-number v-if="field.type == 'number'"
                                      :min="field.minimum"
                                      :max="field.maximum"
                                      class="fw-num"
                                      v-model="value[sectionName][propName][fieldName]"
                                      :placeholder="field.default">
                      </el-input-number>

                      <div class="subfield-label" v-html="prettify(fieldName, prop).toLowerCase()"></div>
                    </el-form-item>
                  </el-col>
                </el-row>
              </div>

            </el-col>
          </el-form>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
 import metadataSchema from '../assets/metadata_schema.json';
 import Ajv from 'ajv';
 import gql from 'graphql-tag';
 import merge from 'lodash/merge';
 import fetch from 'isomorphic-fetch';
 import {getJWT, decodePayload} from '../util.js';

 const ajv = new Ajv({allErrors: true});
 const validator = ajv.compile(metadataSchema);

 const FIELD_WIDTH = {
   'Institution': 6,
   'Submitter': 9,
   'First_Name': 12,
   'Surname': 12,
   'Principal_Investigator': 9,
   'Publication_DOI': 13,
   'Email': 24,
   'Polarity': 3,
   'Ionisation_Source': 5,
   'Analyzer': 4,
   'Detector_Resolving_Power': 12,
   'mz': 12,
   'Resolving_Power': 12,
   'Dataset_Name': 7
 };

 function objectFactory(schema) {
   let obj = {};
   for (var name in schema.properties) {
     const prop = schema.properties[name];
     obj[name] = factories[prop.type](prop);
   }
   return obj;
 }

 const factories = {
   'string': schema => schema.default || '',
   'number': schema => schema.default || 0,
   'object': objectFactory
 }

 function isEmpty(obj) {
   if (!obj)
     return true;
   if (!(obj instanceof Object))
     return false;
   let empty = true;
   for (var key in obj) {
     if (!isEmpty(obj[key])) {
       empty = false;
       break;
     }
   }
   return empty;
 }

 function trimEmptyFields(schema, value) {
   if (!(value instanceof Object))
     return value;
   let obj = Object.assign({}, value);
   for (var name in schema.properties) {
     const prop = schema.properties[name];
     if (isEmpty(obj[name]) && (!schema.required || schema.required.indexOf(name) == -1))
       delete obj[name];
     else
       obj[name] = trimEmptyFields(prop, obj[name]);
   }
   return obj;
 }

 // TODO: fill in institution automatically when user profiles are added

 export default {
   name: 'metadata-editor',
   apollo: {
     currentValue: {
       query: gql`query GetMetadataJSON($id: String!) {
         dataset(id: $id) {
           metadataJson
         }
       }`,
       update(data) {
         const defaultValue = objectFactory(metadataSchema),
               value = JSON.parse(data.dataset.metadataJson);
         /* we want to have all nested fields to be present for convenience,
            that's what objectFactory essentially does */
         this.value = merge({}, defaultValue, value);
         this.loading = false;
         return this.value;
       },
       variables() {
         return {
           id: this.datasetId
         };
       }
     }
   },
   data() {
     return {
       schema: metadataSchema,
       value: objectFactory(metadataSchema),
       validationErrors: [],
       loading: true
     }
   },
   computed: {
     datasetId() {
       return this.$store.state.route.params.dataset_id;
     },

     loggedIn() {
       return this.$store.state.authenticated;
     },

     errorMessages() {
       let messages = {};
       for (let err of this.validationErrors) {
         messages[err.dataPath] = err.message;
       }
       return messages;
     }
   },
   methods: {
     prettify(propName, parent) {
       let name = propName.toString()
                          .replace(/_/g, ' ')
                          .replace(/ [A-Z][a-z]/g, (x) => ' ' + x.slice(1).toLowerCase())
                          .replace(/ freetext$/, '')
                          .replace('metaspace', 'METASPACE');

       if (this.isRequired(propName, parent))
         name += '<span style="color: red">*</span>';
       return name;
     },

     getWidth(propName) {
       if (this.isFreeText(propName))
         return 12;
       return FIELD_WIDTH[propName] || 6;
     },

     isFreeText(propName) {
       return propName.endsWith('Freetext');
     },

     isRequired(propName, parent) {
       return parent && parent.required && (parent.required.indexOf(propName) != -1);
     },

     isError(...args) {
       let path = '';
       for (let arg of args)
         path += '.' + arg;
       let msg = this.errorMessages[path];
       if (msg)
         return 'is-error';
       else
         return '';
     },

     getErrorMessage(...args) {
       let path = '';
       for (let arg of args)
         path += '.' + arg;
       return this.errorMessages[path];
     },

     cancel() {
       this.$router.go(-1);
     },

     submit() {
       const cleanValue = trimEmptyFields(metadataSchema, this.value);
       validator(cleanValue);
       this.validationErrors = validator.errors || [];

       if (this.validationErrors.length > 0) {
         this.$message({
           message: 'Please fix the highlighted fields and submit again',
           type: 'error'
         })
       } else {
         getJWT().then(jwt => this.updateMetadata(jwt, JSON.stringify(cleanValue)))
           .then(() => {
             this.$message({
               message: 'Metadata was successfully updated!',
               type: 'success'
             });

             this.$router.go(-1);
           })
           .catch(err =>
             this.$message({message: 'Couldn\'t save the form: ' + err.message, type: 'error'})
           );
       }
     },

     updateMetadata(jwt, value) {
       return this.$apollo.mutate({
         mutation: gql`mutation ($jwt: String!, $dsId: String!, $value: String!) {
           updateMetadata(jwt: $jwt, datasetId: $dsId, metadataJson: $value)
         }`,
         variables: {jwt, value, dsId: this.datasetId}
       }).then(resp => resp.data.updateMetadata)
         .then(status => {
           if (status != 'success')
             throw new Error(status);
         });
     }
   }
 }
</script>

<style>

 #md-editor-container {
   display: flex;
   justify-content: center;
 }

 .metadata-section > .heading {
   font-size: 18px;
   font-weight: 700;
   margin-bottom: 8px;
 }

 .metadata-section {
   display: block;
   max-width: 1000px;
 }

 .field-label {
   font-size: 16px;
   padding: 0px 0px 3px 5px;
 }

 .subfield {
   padding-right: 10px;
 }

 .subfield-label {
   font-size: 14px;
   padding: 0px 0px 5px 5px;
 }

 .control {
   padding: 0px 5px 10px 5px;
 }

 .fw-num {
   width: 100%;
 }

 #md-editor-submit {
   position: absolute;
   right: 5px;
   top: -7px;
 }

 #md-editor-submit > button {
   width: 100px;
   padding: 6px;
 }

 .control.el-form-item, .subfield > .el-form-item {
   margin-bottom: 0px;
 }

 .control > .el-form-item__content {
   line-height: normal;
 }

 .subfield > .el-form-item > .el-form-item__content {
   line-height: normal;
 }

 .error-msg {
   font-size: 12px;
   color: red;
 }

 #md-section-list {
   display: flex;
   flex-direction: column;
 }

</style>
