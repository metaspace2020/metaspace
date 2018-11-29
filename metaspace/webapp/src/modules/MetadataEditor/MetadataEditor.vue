<template>
  <div id="md-editor-container">
    <div style="position: relative;" v-if="value != null">
      <div id="md-section-list">
        <form-section v-bind="sectionBinds('Sample_Information')" v-on="sectionEvents('Sample_Information')"/>
        <form-section v-bind="sectionBinds('Sample_Preparation')" v-on="sectionEvents('Sample_Preparation')"/>
        <form-section
          v-bind="sectionBinds('MS_Analysis')"
          v-on="sectionEvents('MS_Analysis')"/>
        <data-management-section
          v-model="metaspaceOptions"
          :error="errors['metaspaceOptions']"
          :submitter="submitter"/>
        <visibility-option-section :isPublic.sync="metaspaceOptions.isPublic"/>
        <metaspace-options-section
          v-model="metaspaceOptions"
          :error="errors['metaspaceOptions']"
          :molDBOptions="molDBOptions"
          :adductOptions="adductOptions"/>
        <form-section v-for="sectionKey in otherSections"
                      :key="sectionKey"
                      v-bind="sectionBinds(sectionKey)"
                      v-on="sectionEvents(sectionKey)"/>
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
  * nesting is limited to 2 levels: section -> field (any sub-fields are handled by having complex editors on the field level)
  * sections are assumed to be objects (except Data_Type, which is a single string value)

    If datasetId is provided, the component fetches existing metadata for
    that dataset from the GraphQL server so that it can be edited.
    Autocompletion functionality also relies on the GraphQL server.

    The other two props are for controlling the submit button behavior.

    On submit button click, the form is checked for validity; if valid,
    a submit event is emitted with dataset ID and stringified form value.
  */

 import {defaultMetadataType, metadataSchemas} from '../../assets/metadataRegistry';
 import {FilterPanel} from '../Filters/index';
 import {deriveFullSchema} from './formStructure';
 import {
   get, set, cloneDeep, defaults,
   isEmpty, isEqual, isPlainObject,
   mapValues, forEach, without, pick, omit,
 } from 'lodash-es';
 import {
   newDatasetQuery,
   fetchAutocompleteSuggestionsQuery,
   editDatasetQuery,
   metadataOptionsQuery,
   datasetSubmitterQuery,
   editDatasetSubmitterQuery,
 } from '../../api/metadata';
 import MetaspaceOptionsSection from './sections/MetaspaceOptionsSection.vue';
 import VisibilityOptionSection from './sections/VisibilityOptionSection.vue';
 import FormSection from './sections/FormSection.vue';
 import DataManagementSection from './sections/DataManagementSection.vue'
 import emailRegex from '../../lib/emailRegex';
 import { safeJsonParse } from '../../util'

 const factories = {
   'string': schema => schema.default || '',
   'number': schema => schema.default || 0,
   'object': schema => mapValues(schema.properties, prop => factories[prop.type](prop)),
   'array': schema => schema.default || [],
   'boolean': schema => schema.default || false,
 };

 const defaultMetaspaceOptions = {
   isPublic: true,
   molDBs: [],
   adducts: [],
   name: '',
   submitterId: null,
   groupId: null,
   projectIds: []
 };

 export default {
   name: 'metadata-editor',
   props: {
     datasetId: String,
     validationErrors: Array,
   },
   components: {
     FormSection,
     MetaspaceOptionsSection,
     FilterPanel,
     VisibilityOptionSection,
     DataManagementSection
   },

   created() {
     this.loadingPromise = this.initializeForm();

     // Clean up local storage from previous versions
     localStorage.removeItem('latestMetadataSubmission');
     localStorage.removeItem('latestMetadataOptions');
     localStorage.removeItem('latestMetadataSubmissionVersion');
   },

   data() {
     return {
       value: null,
       schema: null,
       loadingPromise: null,
       localErrors: {},
       molDBOptions: [],
       possibleAdducts: {},
       metaspaceOptions: cloneDeep(defaultMetaspaceOptions),
       submitter: null,
       initialValue: null,
       initialMetaspaceOptions: null,
     }
   },

   watch: {
     '$store.getters.filter.metadataType'(newMdType) {
       if (this.isNew && newMdType !== this.value.Data_Type) {
         this.reloadForm(newMdType);
       }
     },
     async 'metaspaceOptions.submitterId'(newSubmitterId) {
       if (newSubmitterId != null && (this.submitter == null || this.submitter.id !== newSubmitterId)) {
         const result = await this.$apollo.query({
           query: datasetSubmitterQuery,
           variables: {userId: newSubmitterId},
         });
         this.submitter = result.data.user;
       }
     }
   },

   computed: {
     errors() {
       let errors = cloneDeep(this.localErrors);
       (this.validationErrors || []).forEach(err => set(errors, err.dataPath.split('.').slice(1), err.message));
       return errors;
     },
     isNew() {
       return this.datasetId == null;
     },
     otherSections() {
       const allSections = Object.keys(this.schema.properties);
       const specialSections = [
         'Data_Type',
         'Sample_Information',
         'Sample_Preparation',
         'MS_Analysis',
       ];
       return without(allSections, ...specialSections);
     },
     adductOptions() {
       return this.possibleAdducts[get(this.value, ['MS_Analysis', 'Polarity']) || 'Positive'];
     }
   },
   methods: {
     async loadDataset() {
       const metaspaceOptionsFromDataset = (dataset) => {
         const {isPublic, molDBs, adducts, name, group, projects, submitter, principalInvestigator} = dataset;
         return {
           submitterId: submitter ? submitter.id : null,
           groupId: group ? group.id : null,
           projectIds: projects ? projects.map(p => p.id) : [],
           principalInvestigator: principalInvestigator == null ? null : omit(principalInvestigator, '__typename'),
           isPublic, molDBs, adducts, name,
         };
       };

       if (!this.datasetId) {
         const {data} = await this.$apollo.query({
           query: newDatasetQuery
         });
         const dataset = data.currentUserLastSubmittedDataset;

         return {
           metadata: dataset && safeJsonParse(dataset.metadataJson) || {},
           metaspaceOptions: {
             ...(dataset != null ? metaspaceOptionsFromDataset(dataset) : null),
             submitterId: this.$store.state.currentTour ? null : data.currentUser.id,
             groupId: this.$store.state.currentTour ? null :
               data.currentUser.primaryGroup && data.currentUser.primaryGroup.group.id,
           },
           submitter: data.currentUser
         }
       } else {
         const {data} = await this.$apollo.query({
           query: editDatasetQuery,
           variables: {id: this.datasetId},
         });
         let submitter;
         // If submitter is not the current user, we need to make a second request after finding the submitter's userId
         // to get the rest of the submitter data (groups, projects, etc.)
         if (data.dataset.submitter.id === data.currentUser.id) {
           submitter = data.currentUser;
         } else {
           const {data: submitterData} = await this.$apollo.query({
             query: editDatasetSubmitterQuery,
             variables: {userId: data.dataset.submitter.id},
           });
           submitter = submitterData.user;
         }
         return {
           metadata: JSON.parse(data.dataset.metadataJson),
           metaspaceOptions: metaspaceOptionsFromDataset(data.dataset),
           submitter,
         }
       }
     },

     async loadOptions() {
       const {data} = await this.$apollo.query({
         query: metadataOptionsQuery,
         fetchPolicy: 'cache-first',
       });
       return data;
     },

     async initializeForm() {
       const [dataset, options] = await Promise.all([this.loadDataset(), this.loadOptions()]);
       const mdType = (
         this.isNew
           ? this.$store.getters.filter.metadataType
           : (dataset && dataset.metadata && dataset.metadata.Data_Type)
       ) || defaultMetadataType;
       await this.loadForm(dataset, options, mdType);
     },

     async reloadForm(mdType) {
       const dataset = {
         metadata: this.value,
         metaspaceOptions: this.metaspaceOptions
       };
       await this.loadForm(dataset, await this.loadOptions(), mdType);
     },

     async loadForm(dataset, options, mdType) {
       const loadedMetadata = dataset.metadata;
       const metaspaceOptions = defaults({}, dataset.metaspaceOptions, defaultMetaspaceOptions);
       const {adducts, molecularDatabases} = options;

       // in case user just opened a link to metadata editing page w/o navigation in web-app,
       // filters are not set up
       this.$store.commit('updateFilter', {metadataType: mdType});
       const metadata = this.importMetadata(loadedMetadata, mdType);

       // Load options
       this.possibleAdducts = {
         'Positive': adducts.filter(a => a.charge > 0).map(a => a.adduct),
         'Negative': adducts.filter(a => a.charge < 0).map(a => a.adduct)
       };
       this.molDBOptions = molecularDatabases.map(d => d.name);
       this.schema = deriveFullSchema(metadataSchemas[mdType]);

       if (this.isNew) {
         // If this is a prepopulated form from a previous submission and metabolite databases have changed since that submission,
         // clear the databases so that the user has to re-pick. Otherwise populate it with the default databases.
         // This is because it's expensive to change database later. We want a smart default for new users,
         // but if the user has previously selected a value that is now invalid, they should be made aware so that they
         // can choose an appropriate substitute.
         const selectedDbs = metaspaceOptions.molDBs || [];
         if (selectedDbs.some(db => !this.molDBOptions.includes(db))) {
           metaspaceOptions.molDBs = [];
         } else if (selectedDbs.length === 0) {
           const defaultDbs = molecularDatabases.filter(d => d.default).map(d => d.name);
           metaspaceOptions.molDBs = defaultDbs;
         }
         // Name should be different for each dataset
         metaspaceOptions.name = '';
       }

       this.value = metadata;
       this.metaspaceOptions = metaspaceOptions;
       this.initialValue = cloneDeep(metadata);
       this.initialMetaspaceOptions = cloneDeep(metaspaceOptions);
       if (dataset.submitter != null) {
         this.submitter = dataset.submitter;
       }

       this.updateCurrentAdductOptions();
     },

     importMetadata(loadedMetadata, mdType) {
       const metadata = this.getDefaultMetadataValue(mdType);
       metadata.Data_Type = mdType;

       // Copy loaded metadata over the top of the default value, but only include fields that actually exist and
       // are of the same type to avoid propagating outdated schema
       if (loadedMetadata != null) {
         forEach(loadedMetadata, (loadedSection, sectionKey) => {
           if (isPlainObject(metadata[sectionKey])) {
             forEach(loadedSection, (loadedField, fieldKey) => {
               if (fieldKey in metadata[sectionKey]) {
                 if (typeof loadedField === typeof metadata[sectionKey][fieldKey]) {
                   metadata[sectionKey][fieldKey] = cloneDeep(loadedField);
                 }
               }
             });
           }
         });
       }

       return metadata;
     },

     validate() {
       const errors = {};

       const {molDBs, adducts, name, groupId, principalInvestigator} = this.metaspaceOptions;

       if (isEmpty(molDBs)) {
         set(errors, ['metaspaceOptions', 'molDBs'], 'should have at least 1 selection');
       }
       if (isEmpty(adducts)) {
         set(errors, ['metaspaceOptions', 'adducts'], 'should have at least 1 selection');
       }
       if (!name || name.length < 5) {
         set(errors, ['metaspaceOptions', 'name'], 'should be at least 5 characters');
       } else if (name.length > 50) {
         set(errors, ['metaspaceOptions', 'name'], 'should be no more than 50 characters');
       }

       if (groupId == null && principalInvestigator == null) {
         set(errors, ['metaspaceOptions', 'groupId'], 'select a group');
       }
       if (principalInvestigator != null) {
         const piName = principalInvestigator.name || '';
         const piEmail = principalInvestigator.email || '';
         if (!groupId || piName.length > 0 || piEmail.length > 0) {
           if (piName.length < 4) {
             set(errors, ['metaspaceOptions', 'principalInvestigator', 'name'], 'should be at least 4 characters');
           }
           if (!emailRegex.test(principalInvestigator.email)) {
             set(errors, ['metaspaceOptions', 'principalInvestigator', 'email'], 'should be a valid email address');
           }
         }
       }

       this.localErrors = errors;
     },

     sectionBinds(sectionKey) {
       return {
         sectionKey,
         section: this.schema.properties[sectionKey],
         value: this.value[sectionKey],
         error: this.errors[sectionKey],
         getSuggestionsForField: this.getSuggestionsForField,
       }
     },

     sectionEvents(sectionKey) {
       return {
         input: this.onInput
       }
     },

     onInput(path, val) {
       set(this.value, path, val);

       if(isEqual(path, ['MS_Analysis', 'Polarity'])) {
         this.updateCurrentAdductOptions();
       }
     },

     getDefaultMetadataValue(metadataType) {
       return factories['object'](metadataSchemas[metadataType]);
     },

     updateCurrentAdductOptions() {
       const selectedAdducts = this.metaspaceOptions.adducts;
       let newAdducts = selectedAdducts.filter(adduct => this.adductOptions.includes(adduct))
       // Default to selecting all valid adducts (at least until the less common adducts are added)
       if (newAdducts.length === 0) {
         newAdducts = this.adductOptions.slice();
       }
       this.metaspaceOptions.adducts = newAdducts;
     },

     resetAfterSubmit() {
       this.metaspaceOptions.name = '';
       this.localErrors = {};
     },

     resetMetaboliteDatabase() {
       this.metaspaceOptions.molDBs = [];
     },

     getFormValueForSubmit() {
       this.validate();
       if (!isEmpty(this.localErrors)) {
         this.$message({
           message: 'Please check that you entered metadata correctly!',
           type: "warning"
         });
         return null;
       }

       return {
         datasetId: this.datasetId ? this.datasetId: '',
         metadataJson: JSON.stringify(this.value),
         metaspaceOptions: this.metaspaceOptions,
         initialMetadataJson: JSON.stringify(this.initialValue),
         initialMetaspaceOptions: this.initialMetaspaceOptions,
       }
     },

     getSuggestionsForField(query, callback, ...args) {
       const path = args.join('.');
       this.$apollo.query({
         query: fetchAutocompleteSuggestionsQuery,
         variables: {field: path, query: query || ''}
       }).then(resp => callback(resp.data.metadataSuggestions.map(val => ({value: val}))));
     },

     /* for outside access from the upload page, to autofill it with the filename */
     fillDatasetName(name) {
       this.metaspaceOptions.name = name;
     }
   }
 }
</script>

<style>
 #md-editor-container {
   display: flex;
   justify-content: center;
   margin-bottom: 50px;
 }

 #md-section-list {
   display: flex;
   flex-direction: column;
 }

 #load-indicator {
   min-height: 300px;
 }
</style>
