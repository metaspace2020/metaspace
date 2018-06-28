<template>
  <div id="md-editor-container">
    <div style="position: relative;" v-if="!loading">
      <div id="md-editor-submit">
        <el-switch
          v-model="isPublic"
          active-text="Public"
          inactive-text="Private"
        ></el-switch>
        <el-popover trigger="hover" placement="top" class="md-editor-public-help">
          <div>
            <p><b>Public:</b> Annotations will be available in the METASPACE public knowledge base, sharable and searchable by the community. The uploaded imzML files are not made public.</p>
            <p><b>Private:</b> Annotations will be visible to the submitter (and only the submitter) when the submitter is logged in. METASPACE admins can also view these annotations. The uploaded imzML files are also private.</p>
          </div>
          <i slot="reference" class="el-icon-question"></i>
        </el-popover>
        <el-button @click="cancel" v-if="datasetId">Cancel</el-button>
        <el-button type="primary" v-if="enableSubmit" @click="submit">Submit</el-button>
        <el-button v-else type="primary" disabled :title="disabledSubmitMessage">
          Submit
        </el-button>
      </div>

      <div id="md-section-list">
        <!-- Hardcoded "Data_Type" property of the metadata schema. Not supposed to be changed by user. -->
        <div class="metadata-section"
             v-for="(section, sectionName) in schema.properties" :key="sectionName"
                v-if="sectionName != 'Data_Type'">
          <div class="heading" v-html="prettify(sectionName)"></div>

          <el-form size="medium">
            <el-col :span="getWidth(propName)"
                    v-for="(prop, propName) in section.properties"
                    :key="sectionName + propName">
              <div class="field-label">
                <span v-html="prettify(propName, section)"></span>
                <el-popover trigger="hover" placement="right" v-if="getHelp(propName)">
                  <component :is="getHelp(propName)"></component>
                  <i slot="reference" class="el-icon-question field-label-help"></i>
                </el-popover>
              </div>

              <el-form-item class="control" v-if="prop.type == 'string'"
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
                                   :fetch-suggestions="(q, cb) => getSuggestions(q ? q: '', cb, sectionName, propName)"
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
                  <!-- Custom event handler for polarity selector, as available adduct list should be updated -->
                  <el-select v-if="prop.enum"
                             :required="isRequired(propName, section)"
                             @change="propName == 'Polarity' ? onPolarityChange(): null"
                             v-model="value[sectionName][propName]">
                    <el-option v-for="opt in prop.enum" :value="opt" :label="opt" :key="opt">
                    </el-option>
                  </el-select>
                </div>

                <span class="error-msg" v-if="isError(sectionName, propName)">
                  {{ getErrorMessage(sectionName, propName) }}
                </span>
              </el-form-item>

              <el-form-item class="control" v-if="prop.type == 'boolean'"
                            :class="isError(sectionName, propName)">

                <div>
                  <el-checkbox v-model="value[sectionName][propName]"
                            :placeholder="prop.description">
                  </el-checkbox>
                </div>

                <span class="error-msg" v-if="isError(sectionName, propName)">
                  {{ getErrorMessage(sectionName, propName) }}
                </span>
              </el-form-item>

              <el-form-item class="control" v-if="prop.type == 'array'"
                            :class="isError(sectionName, propName)">

                <el-select v-if="!isTable(propName) && prop.items.enum"
                           :required="isRequired(propName, section)"
                           multiple
                           v-model="value[sectionName][propName]">
                  <el-option v-for="opt in prop.items.enum" :value="opt" :label="opt" :key="opt">
                  </el-option>
                </el-select>

                <div v-if="isTable(propName)" style="height: 240px">
                  <el-table :data="value[sectionName][propName]"
                            highlight-current-row
                            @current-change="(newRow, oldRow) => newRow ? $set(formTableCurrentRows, `${sectionName}-${propName}`, value[sectionName][propName].indexOf(newRow))
                                                                        : $delete(formTableCurrentRows, `${sectionName}-${propName}`)"
                            :empty-text="prop.description"
                            border
                            max-height="200">
                    <el-table-column v-for="(field, fieldName) in prop.items.properties" :key="fieldName" :label="field.title" :prop="fieldName">
                      <div slot-scope="scope">
                        <el-input-number v-if="field.type == 'number' || field.type == 'integer'" v-model="scope.row[fieldName]" style="width: inherit" />
                        <el-input v-else v-model="scope.row[fieldName]" :placeholder="field.description" />
                      </div>
                    </el-table-column>
                  </el-table>
                  <el-button @click.native.prevent="value[sectionName][propName].splice(formTableCurrentRows[`${sectionName}-${propName}`], 1)"
                             :disabled="!(`${sectionName}-${propName}` in formTableCurrentRows)"
                             class="table-btn">Delete row</el-button>
                  <el-button @click.native.prevent="insertObjectToArray(value[sectionName][propName], value[sectionName][propName].length, Object.keys(prop.items.properties))"
                             class="table-btn">Add row</el-button>
                </div>

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
                                  :required="isRequired(fieldName, prop)">

                      <el-input v-if="field.type == 'string'"
                                v-model="value[sectionName][propName][fieldName]"
                                :placeholder="field.description"
                                :disabled="isDisabled(sectionName, propName, fieldName)">
                      </el-input>

                      <el-input-number v-if="field.type == 'number'"
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
    <div id="load-indicator" v-else v-loading="true">
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
  * anything with name ending in _Free_Text renders as a textarea.
  * If name ends with _Table, it'll be rendered as a table.
  * Strings and numbers are supported for subfields.

    FIELD_WIDTH dictionary can be used to control field/subfield widths.

    If datasetId is provided, the component fetches existing metadata for
    that dataset from the GraphQL server so that it can be edited.
    Autocompletion functionality also relies on the GraphQL server.

    The other two props are for controlling the submit button behavior.

    On submit button click, the form is checked for validity; if valid,
    a submit event is emitted with dataset ID and stringified form value.
  */

 import {defaultMetadataType, metadataSchemas} from '../assets/metadataRegistry';
 import Ajv from 'ajv';
 import merge from 'lodash/merge';
 import {
   fetchAutocompleteSuggestionsQuery,
   fetchMetadataQuery,
   metadataOptionsQuery
 } from '../api/metadata';
 import Vue from 'vue';
 import DatabaseDescriptions from './DatabaseDescriptions.vue';


 const ajv = new Ajv({allErrors: true});
 // clear schema cache
 ajv.removeSchema();
 const schemaValidators = {};

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
   'Solvent_A_Table': 7,
   'Solvent_B_Table': 7,
   'Gradient_Table': 9
 };

 const FIELD_HELP = {
   'Metabolite_Database': DatabaseDescriptions
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
   'array': schema => schema.default || [],
   'boolean': schema => schema.default || false,
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
   apollo: {
     metadataSelectorOptions: {
       query: metadataOptionsQuery,
       update(data) {
         this._possibleAdducts = {
           'Positive': data.adducts.filter(a => a.charge > 0).map(a => a.adduct),
           'Negative': data.adducts.filter(a => a.charge < 0).map(a => a.adduct)
         };
         this.molecularDatabases = data.molecularDatabases.map(d => d.name);

         this.updateSchemaOptions();
         this.applyDefaultDatabases();
         this.updateCurrentAdductOptions();
       },
       loadingKey: 'loading'
     },
     existingMetadata: {
       query: fetchMetadataQuery,
       variables() {
         return { id: this.datasetId };
       },
       fetchPolicy: 'network-only',
       skip() {
         return !this.datasetId;
       },
       update(data) {
         this.value = this.fixEntries(JSON.parse(data.dataset.metadataJson));
         this._datasetMdType = this.value.Data_Type || defaultMetadataType;
         const defaultValue = this.getDefaultMetadataValue(this._datasetMdType);
         this.value = merge({}, defaultValue, this.getCurrentUserAsSubmitter(), this.value);
         this.isPublic = data.dataset.isPublic !== false; // Default null/undefined to true
         this.updateCurrentAdductOptions();
         this.updateSchemaOptions();

         // in case user just opened a link to metadata editing page w/o navigation in web-app,
         // filters are not set up
         this.$store.commit('updateFilter', {metadataType: this._datasetMdType});
       },
       loadingKey: 'loading'
     }
   },

   mounted() {
     // no datasetId means a new dataset => help filling out by loading the last submission
     if (!this.datasetId) {
       this.loadLastSubmission();
     }
   },

   data() {
     // some default value before we download metadata
     this._datasetMdType = this.$store.getters.filter.metadataType || defaultMetadataType;
     return {
       value: merge({}, this.getDefaultMetadataValue(this._datasetMdType), this.getCurrentUserAsSubmitter()),
       isPublic: true,
       loading: 0,
       molecularDatabases: null,
       defaultDatabaseApplied: false,
       // dictionary with highlighted row numbers in each table in the submission form
       // keys in the dictionary are formatted like `metadata_section-section-property`
       // if no row is highlighted, the corresponding key must not be in the dictionary
       formTableCurrentRows: {}

     }
   },

   computed: {
     schema() {
       return metadataSchemas[this.currentMetadataType()];
     },

     validator() {
       const currentMdType = this.currentMetadataType();
       if (!(currentMdType in schemaValidators)) {
         schemaValidators[currentMdType] = ajv.compile(metadataSchemas[currentMdType]);
       }
       return schemaValidators[currentMdType];
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
     currentMetadataType() {
       return this.datasetId ? this._datasetMdType : this.$store.getters.filter.metadataType || this._datasetMdType;
     },

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
                          .replace(/( freetext$| table$)/, '')
                          .replace('metaspace', 'METASPACE');

       if (this.isRequired(propName, parent))
         name += '<span style="color: red">*</span>';
       return name;
     },

     getDefaultMetadataValue(metadataType) {
       return objectFactory(metadataSchemas[metadataType]);
     },

     getCurrentUserAsSubmitter() {
       const user = this.$store.state.user,
         email = user ? user.email : '';
       return {Submitted_By: {Submitter: {Email: email}}};
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

     isTable(propName) {
       return propName.endsWith('Table');
     },

     enableAutocomplete(propName) {
       return propName != 'Dataset_Name' && propName != 'Email';
     },

     isRequired(propName, parent) {
       return parent && parent.required && (parent.required.indexOf(propName) != -1);
     },

     isDisabled(...args) {
       return args[0] === 'Submitted_By' && args[1] === 'Submitter' && args[2] === 'Email';
     },

     buildPath(...args) {
       let path = '';
       for (let arg of args)
         path += '.' + arg;
       return path;
     },

     isError(...args) {
       let result = '';
       const propPath = this.buildPath(...args);
       if (this.isTable(args[args.length - 1])) {
         // for table fields errors look like schema.path.field[rowNum].colName
         for (const errorKey of Object.keys(this.errorMessages)) {
           if (errorKey == propPath || RegExp(`^${propPath}\\[\\d+\\]`).test(errorKey)) {
             result = 'is-table-error';
             break;
           }
         }
       } else {
         result = propPath in this.errorMessages ? 'is-error' : '';
       }
       return result;
     },

     getSchemaField(...args) {
       if (args.length > 2) {
         const newArgs = args.slice(1, args.length - 1);
         newArgs.push(args[args.length - 1].properties[args[0]]);
         return this.getSchemaField(...newArgs);
       } else if (args.length == 2) {
         return args[1].properties[args[0]];
       } else {
         throw 'Unexpected number of arguments';
       }
     },

     getErrorMessage(...args) {
       let result = '';
       if (this.isTable(args[args.length - 1])) {
         result = this.getTableErrorMessage(...args);
       } else {
         result = this.errorMessages[this.buildPath(...args)];
       }
       return result;
     },

     // for table content, error keys look like "schema.field.subfield[rowNum].colName"
     getTableErrorMessage(...args) {
       let result = '';
       const propPath = this.buildPath(...args);
       const colNameRe = RegExp(`^${propPath}\\[\\d+\\]`);
       for (const errorKey of Object.keys(this.errorMessages)) {
         if (errorKey == propPath || colNameRe.test(errorKey)) {
           if (errorKey.length != propPath.length) {
             const errorPath = errorKey.match(colNameRe)[0];
             const zeroBasedErrRow = errorKey.substring(errorPath.lastIndexOf('[') + 1, errorPath.lastIndexOf(']'));
             const errorRow = Number(zeroBasedErrRow) + 1;
             const columnName = errorKey.substring(errorPath.length + 1);
             if (columnName) {
               const schemaPath = args.slice();
               schemaPath.push(this.schema);
               const schemaField = this.getSchemaField(...schemaPath);
               const columnDisplayName = schemaField.items.properties[columnName].title;
               result = `Row ${errorRow}: "${columnDisplayName}" ${this.errorMessages[errorKey]}`;
             } else {
               result = `Row ${errorRow} ${this.errorMessages[errorKey]}`;
             }
           } else {
             result = this.errorMessages[errorKey];
           }
           break;
         }
       }
       return result;
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

     applyDefaultDatabases() {
       if(this.molecularDatabases && !this.defaultDatabaseApplied) {
         const defaultDatabases = this.molecularDatabases.filter(d => d.default).map(d => d.name);
         this.value = merge({}, this.value, {metaspace_options: {Metabolite_Database: defaultDatabases}});
         this.defaultDatabaseApplied = true;
       }
     },

     loadLastSubmission() {
       const lastValue = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
       const lastVersion = JSON.parse(localStorage.getItem(LOCAL_STORAGE_VERSION_KEY) || '1');
       if (lastValue && lastValue.metaspace_options) {
         lastValue.metaspace_options.Dataset_Name = ''; // different for each dataset

         const defaultValue = this.getDefaultMetadataValue(this._datasetMdType);
         /* we want to have all nested fields to be present for convenience,
                     that's what objectFactory essentially does */
         this.value = merge({}, defaultValue, this.fixEntries(lastValue), this.getCurrentUserAsSubmitter());
         this.updateSchemaOptions();
         this.applyDefaultDatabases();
         this.updateCurrentAdductOptions();

         // If people have a saved form value, clear the database (instead of using the new default) to ensure
         // that they're aware that the databases have changed.
         if (lastVersion < 2) {
           this.value.metaspace_options.Metabolite_Database = [];
         }
       }
     },

     updateSchemaOptions() {
       const schema = metadataSchemas[this.currentMetadataType()];

       const curDataType = schema.properties.Data_Type.enum[0];
       if (this.value.Data_Type !== curDataType) {
         this.value.Data_Type = curDataType;
       }

       if (!this.schemaHasMolDbOptions(schema) && this.molecularDatabases) {
         Vue.set(schema.properties.metaspace_options.properties.Metabolite_Database.items, 'enum',
           this.molecularDatabases);

         const selectedPolarity = this.value.MS_Analysis.Polarity;
         Vue.set(schema.properties.metaspace_options.properties.Adducts.items, 'enum',
           selectedPolarity ? this._possibleAdducts[selectedPolarity] : []);
       }
     },

     schemaHasMolDbOptions(schema) {
       return 'enum' in schema.properties.metaspace_options.properties.Metabolite_Database.items;
     },

     updateCurrentAdductOptions() {
       if (this._possibleAdducts && (this.value.MS_Analysis.Polarity in this._possibleAdducts)) {
         const adductsForPolarity = this._possibleAdducts[this.value.MS_Analysis.Polarity];
         Vue.set(this.schema.properties.metaspace_options.properties.Adducts.items,
                 'enum',
                 adductsForPolarity);

         let selectedAdducts = this.value.metaspace_options.Adducts;
         selectedAdducts = selectedAdducts.filter(adduct => adductsForPolarity.includes(adduct))
         // Default to selecting all valid adducts (at least until the less common adducts are added)
         if (selectedAdducts.length === 0) {
           selectedAdducts = adductsForPolarity.slice();
         }
         this.value.metaspace_options.Adducts = selectedAdducts;
       }
     },

     onPolarityChange() {
       this.updateCurrentAdductOptions();
     },

     resetDatasetName() {
       this.value.metaspace_options.Dataset_Name = '';
     },

     resetMetaboliteDatabase() {
       this.value.metaspace_options.Metabolite_Database = [];
     },

     submit() {
       const value = JSON.stringify(this.value);
       this.$emit('submit', this.datasetId, value, this.isPublic);
       if (!this.datasetId) {
         localStorage.setItem(LOCAL_STORAGE_KEY, value);
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
     fillDatasetName(name) {
       this.value.metaspace_options.Dataset_Name = name;
     },

     insertObjectToArray(array, index, keys) {
       const newObj = keys.reduce((res, key) => {
         res[key] = undefined;
         return res;
       }, {})
       array.splice(index, 0, newObj);
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

 .field-label-help {
   cursor: pointer;
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
   display: flex;
   align-items: center;
   right: 5px;
   top: -3px;
   z-index: 10
 }

 #md-editor-submit > button {
   width: 100px;
   padding: 6px;
 }

 .md-editor-public-help {
   cursor: pointer;
   padding: 0 16px 0 8px;
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

 #load-indicator {
   min-height: 300px;
 }

 .el-table__body-wrapper {
   overflow-x: hidden;
 }

 .el-table__empty-block {
   min-height: inherit;
   height: 50px;
 }

 .el-table__empty-text {
   width: 90%;
   color: #B5BCCC;
 }

 .el-table table tr > td {
   padding-top: 5px;
   padding-bottom: 5px;
 }

 .el-table table tr > td {
   padding-top: 5px;
   padding-bottom: 5px;
 }

 .el-table thead tr > th {
   padding-top: 5px;
   padding-bottom: 5px;
 }

 .el-table thead tr > th > .cell {
   padding-left: 10px;
   padding-right: 5px;
 }

 .table-btn {
   float: right;
   margin-top: 5px;
   margin-left: 5px;
 }

 .is-table-error .el-table {
   border: 1px solid red;
 }

</style>
