<template>
  <div id="md-editor-container">
    <div style="position: relative;">
      <div id="md-editor-submit">
        <router-link :to="opticalImageAlignmentHref" v-if="datasetId"
                     style="width: 150px; margin-right: 50px;">
          Add optical image...
        </router-link>
        <el-button @click="cancel" v-if="datasetId">Cancel</el-button>
        <el-button type="primary" v-if="enableSubmit" @click="submit">Submit</el-button>
        <el-button v-else type="primary" disabled :title="disabledSubmitMessage">
          Submit
        </el-button>
      </div>

      <div id="md-section-list" v-loading="loading">

        <div class="metadata-section"
             v-for="(section, sectionName) in schema.properties"
             :key="sectionName">
          <div class="heading" v-html="prettify(sectionName)"></div>

          <el-form size="medium">
            <el-col :span="getWidth(propName)"
                    v-for="(prop, propName) in section.properties"
                    :key="sectionName + propName">
              <div class="field-label" v-html="prettify(propName, section)"></div>

              <el-form-item class="control" v-if="prop.type == 'string' && !loading"
                            :class="isError(sectionName, propName)">

                <div>
                  <el-input v-if="isFreeText(propName)"
                            type="textarea"
                            :required="isRequired(propName, section)"
                            v-model="value[sectionName][propName]"
                            :placeholder="prop.description">
                  </el-input>
                </div>

                <div>
                  <el-autocomplete v-if="!prop.enum && enableAutocomplete(propName) && !isFreeText(propName)"
                                   :trigger-on-focus="true"
                                   class="md-ac"
                                   v-model="value[sectionName][propName]"
                                   :required="isRequired(propName, section)"
                                   :fetch-suggestions="(q, cb) => getSuggestions(q, cb, sectionName, propName)"
                                   :placeholder="prop.description">
                  </el-autocomplete>
                </div>

                <div>
                  <el-input v-if="!prop.enum && !enableAutocomplete(propName) && !isFreeText(propName)"
                            v-model="value[sectionName][propName]"
                            :required="isRequired(propName, section)"
                            :placeholder="prop.description">
                  </el-input>
                </div>

                <div>
                  <el-select v-if="prop.enum"
                             :required="isRequired(propName, section)"
                             v-model="value[sectionName][propName]">
                    <el-option v-for="opt in prop.enum" :value="opt" :label="opt" :key="opt">
                    </el-option>
                  </el-select>
                </div>

                <span class="error-msg" v-if="isError(sectionName, propName)">
                  {{ getErrorMessage(sectionName, propName) }}
                </span>
              </el-form-item>

              <el-form-item class="control" v-if="prop.type == 'array' && !loading"
                            :class="isError(sectionName, propName)">
                <!-- so far it's only for Metabolite_Database  -->
                <el-select v-if="prop.items.enum"
                           :required="isRequired(propName, section)"
                           multiple
                           v-model="value[sectionName][propName]">
                  <el-option v-for="opt in prop.items.enum" :value="opt" :label="opt" :key="opt">
                  </el-option>
                </el-select>
                <span class="error-msg" v-if="isError(sectionName, propName)">
                  {{ getErrorMessage(sectionName, propName) }}
                </span>
              </el-form-item>

              <div class="control" v-if="prop.type == 'object'" >
                <el-row>
                  <el-col :span="getWidth(fieldName)"
                          class="subfield"
                          v-for="(field, fieldName) in prop.properties" :key="sectionName + propName + fieldName">

                    <el-form-item :class="isError(sectionName, propName, fieldName)"
                                  v-if="!loading"
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

                      <span class="error-msg" v-if="isError(sectionName, propName, fieldName)">
                        {{ getErrorMessage(sectionName, propName, fieldName) }}
                      </span>
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
 /*
    This component serves two purposes:
  * editing metadata of existing datasets;
  * providing metadata during the initial upload.

    It has a few simplifying assumptions on the structure and types used:
  * nesting is limited to 3 levels: section -> field -> subfield
  * sections are assumed to be objects
  * strings, numbers and enums are supported for fields
  * anything with name ending in Free_Text renders as a textarea
  * strings and numbers are supported for subfields

    FIELD_WIDTH dictionary can be used to control field/subfield widths.

    If datasetId is provided, the component fetches existing metadata for
    that dataset from the GraphQL server so that it can be edited.
    Autocompletion functionality also relies on the GraphQL server.

    The other two props are for controlling the submit button behavior.

    On submit button click, the form is checked for validity; if valid,
    a submit event is emitted with dataset ID and stringified form value.
  */

 import metadataSchema from '../assets/metadata_schema.json';
 import Ajv from 'ajv';
 import merge from 'lodash/merge';
 import {
   fetchAutocompleteSuggestionsQuery,
   fetchMetadataQuery
 } from '../api/metadata';
 import gql from 'graphql-tag';
 import Vue from 'vue';

 const ajv = new Ajv({allErrors: true});

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
   'Dataset_Name': 7,
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
   'object': objectFactory,
   'array': schema => schema.default || []
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
   if (Array.isArray(value))
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

 const LOCAL_STORAGE_KEY = 'latestMetadataSubmission';

 // TODO: fill in institution automatically when user profiles are added

 export default {
   name: 'metadata-editor',
   props: ['datasetId', 'enableSubmit', 'disabledSubmitMessage'],
   created() {
     this.loading = true;
     this.$apollo.query({query: gql`{molecularDatabases{name}}`}).then(response => {
       Vue.set(this.schema.properties.metaspace_options.properties.Metabolite_Database.items,
               'enum',
               response.data.molecularDatabases.map(d => d.name));
       this.validator = ajv.compile(this.schema);
       this.setLoadingStatus(false);
     }).catch(err => {
       console.log("Error fetching list of metabolite databases: ", err);
     });
   },

   mounted() {
     // no datasetId means a new dataset => help filling out by loading the last submission
     if (!this.datasetId) {
       this.loadLastSubmission();
       return;
     }

     this.loading = true;
     // otherwise we need to fetch existing data from the server
     this.$apollo.query({
       query: fetchMetadataQuery,
       variables: { id: this.datasetId },
       fetchPolicy: 'network-only'
     }).then(resp => {
       const defaultValue = objectFactory(metadataSchema),
             value = this.fixEntries(JSON.parse(resp.data.dataset.metadataJson));
       this.value = merge({}, defaultValue, value);
       this.setLoadingStatus(false);
     }).catch(err => {
       console.log("Error fetching current metadata: ", err);
     });
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
     errorMessages() {
       let messages = {};
       for (let err of this.validationErrors) {
         messages[err.dataPath] = err.message;
       }
       return messages;
     },

     opticalImageAlignmentHref() {
       return {
         name: 'add-optical-image',
         params: {dataset_id: this.datasetId}
       };
     },
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

     enableAutocomplete(propName) {
       return propName != 'Dataset_Name' && propName != 'Email';
     },

     isRequired(propName, parent) {
       return parent && parent.required && (parent.required.indexOf(propName) != -1);
     },

     buildPath(...args) {
       let path = '';
       for (let arg of args)
         path += '.' + arg;
       return path;
     },

     isError(...args) {
       let msg = this.errorMessages[this.buildPath(...args)];
       if (msg)
         return 'is-error';
       else
         return '';
     },

     getErrorMessage(...args) {
       return this.errorMessages[this.buildPath(...args)];
     },

     cancel() {
       this.$router.go(-1);
     },

     fixEntries(oldValue) {
       let value = oldValue;
       if (value.metaspace_options) {
         const databases = value.metaspace_options.Metabolite_Database;
         if (!Array.isArray(databases))
           value = merge({}, value,
                         {'metaspace_options': {'Metabolite_Database': [databases]}});
       }
       return value;
     },

     loadLastSubmission() {
       const defaultValue = objectFactory(metadataSchema);
       let lastValue = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
       if (lastValue && lastValue.metaspace_options) {
         lastValue.metaspace_options.Dataset_Name = ''; // different for each dataset

         /* we want to have all nested fields to be present for convenience,
            that's what objectFactory essentially does */
         this.value = merge({}, defaultValue, this.fixEntries(lastValue));
       } else {
         this.value = defaultValue;
       }
       this.setLoadingStatus(false);
     },

     setLoadingStatus(value) {
       // https://github.com/ElemeFE/element/issues/4834
       this.$nextTick(() => { this.loading = value; });
     },

     resetDatasetName() {
       this.value.metaspace_options.Dataset_Name = '';
     },

     submit() {
       const cleanValue = trimEmptyFields(metadataSchema, this.value);

       this.validator(cleanValue);
       this.validationErrors = this.validator.errors || [];

       if (this.validationErrors.length > 0) {
         this.$message({
           message: 'Please fix the highlighted fields and submit again',
           type: 'error'
         })
       } else {
         const value = JSON.stringify(cleanValue);
         if (!this.datasetId) localStorage.setItem(LOCAL_STORAGE_KEY, value);

         this.$emit('submit', this.datasetId, value);
       }
     },

     getSuggestions(query, callback, ...args) {
       const path = this.buildPath(...args).slice(1);
       this.$apollo.query({
         query: fetchAutocompleteSuggestionsQuery,
         variables: {field: path, query}
       }).then(resp => callback(resp.data.metadataSuggestions.map(val => ({value: val}))));
     },

     /* for outside access from the upload page, to autofill it with the filename */
     suggestDatasetName(name) {
       if (this.value.metaspace_options.Dataset_Name == '')
         this.value.metaspace_options.Dataset_Name = name;
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
   top: -3px;
   z-index: 10
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

 .md-ac {
   width: 100%;
 }

</style>
