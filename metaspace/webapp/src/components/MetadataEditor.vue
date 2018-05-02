<template>
  <div id="md-editor-container">
    <div style="position: relative;">
      <div id="md-editor-submit">
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
              <div class="field-label">
                <span v-html="prettify(propName, section)"></span>
                <el-popover trigger="hover" placement="right" v-if="getHelp(propName)">
                  <div v-html="getHelp(propName)"></div>
                  <i slot="reference" class="el-icon-question"></i>
                </el-popover>
              </div>

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
 import merge from 'lodash/merge';
 import {
   fetchAutocompleteSuggestionsQuery,
   fetchMetadataQuery
 } from '../api/metadata';
 import gql from 'graphql-tag';
 import Vue from 'vue';

 //TODO Lachlan: Consolidate hard-coded data into its own file, using full paths instead of field names and
 // components instead of HTML snippets.
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

 const FIELD_HELP = {
   'Metabolite_Database': `
   <div class="md-editor-tooltip">
     <p>
       The database selection determines which metabolites will be annotated.
       Many databases are for specific types of sample, please see their respective webpages for details.
       <b>HMDB-v4</b> is the best choice for most datasets.
     </p>
     <p>
       <b>Brassica Napus database (BraChemDB):</b>
       A curated rapeseed database from LC-MS/MS measurements.
     </p>
     <p>
       <b><a href="https://www.ebi.ac.uk/chebi/aboutChebiForward.do">Chemical Entities of Biological Interest (ChEBI)</a>:</b>
        ChEBI is a database and ontology containing information about chemical entities of biological interest, each of which is classified within the ontology and assigned multiple annotations including (where relevant) a chemical structure, database cross-references, synonyms and literature citations.
     </p>
     <p>
       <b><a href="http://www.hmdb.ca/about">Human Metabolome Database (HMDB)</a>:</b>
       Database containing detailed information about small molecule metabolites found in the human body. The database is designed to contain or link three kinds of data: 1) chemical data, 2) clinical data, and 3) molecular biology/biochemistry data. The database contains 114,064 metabolite entries including both water-soluble and lipid soluble metabolites as well as metabolites that would be regarded as either abundant (> 1 uM) or relatively rare (< 1 nM).  HMDB-endogenous is a filtered version of HMDB that contains only those molecules labelled in the database as endogenously produced.
     </p>
     <p>
       <b><a href="http://www.lipidmaps.org/data/databases.html">LIPID Metabolites And Pathways Strategy (LipidMaps)</a>:</b>
       A multi-institutional effort created in 2003 to identify and quantitate, using a systems biology approach and sophisticated mass spectrometers, all of the major — and many minor — lipid species in mammalian cells.
     </p>
     <p>
       <b><a href="http://pseudomonas.umaryland.edu/">Pseudomonas aeruginosa Metabolome Database (PAMDB)</a>:</b>
       The PAMDB is an expertly curated database containing extensive metabolomic data and metabolic pathway diagrams about Pseudomonas aeruginosa (reference strain PAO1).
     </p>
     <p>
       <b><a href="http://www.swisslipids.org/#/about">SwissLipids</a>:</b>
       An expert curated resource that provides a framework for the integration of lipid and lipidomic data with biological knowledge and models.  Information about known lipids, including knowledge of lipid structures, metabolism, interactions, and subcellular and tissular localization is curated from peer-reviewed literature. The set of known, expert curated lipids provided by SwissLipids is complemented by a library of theoretical lipid structures.
     </p>
   </div>`
 }

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

 const LOCAL_STORAGE_KEY = 'latestMetadataSubmission';
 const LOCAL_STORAGE_VERSION_KEY = 'latestMetadataSubmissionVersion';
 const LOCAL_STORAGE_CURRENT_VERSION = 2;

 // TODO: fill in institution automatically when user profiles are added

 export default {
   name: 'metadata-editor',
   props: {
     datasetId: String,
     enableSubmit: Boolean,
     disabledSubmitMessage: String,
     validationErrors: {
       type: Array,
       default: () => []
     }
   },

   created() {
     this.loading = true;
     this.$apollo.query({query: gql`{molecularDatabases{name}}`}).then(response => {
       Vue.set(this.schema.properties.metaspace_options.properties.Metabolite_Database.items,
               'enum',
               response.data.molecularDatabases.map(d => d.name));
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
     }
   },
   methods: {
     safelyParseJSON(json) {
       let parseRes;
       try {
         parseRes = JSON.parse(json);
       } catch (err) {
         return 'failed_parsing';
       }
       return parseRes;
     },

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

     getHelp(propName) {
       return FIELD_HELP[propName];
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
       const lastValue = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
       const lastVersion = JSON.parse(localStorage.getItem(LOCAL_STORAGE_VERSION_KEY) || '1');

       if (lastValue && lastValue.metaspace_options) {
         lastValue.metaspace_options.Dataset_Name = ''; // different for each dataset

         /* we want to have all nested fields to be present for convenience,
            that's what objectFactory essentially does */
         this.value = merge({}, defaultValue, this.fixEntries(lastValue));

         if (lastVersion < 2) {
           this.value.metaspace_options.Metabolite_Database = [];
         }
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
       this.$emit('submit', this.datasetId, JSON.stringify(this.value));
       if (!this.datasetId) {
         localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.value));
         localStorage.setItem(LOCAL_STORAGE_VERSION_KEY, JSON.stringify(LOCAL_STORAGE_CURRENT_VERSION));
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

 .md-editor-tooltip {
   width: 80vh;
   max-width: 600px;
   word-break: normal;
   text-align: left;
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
