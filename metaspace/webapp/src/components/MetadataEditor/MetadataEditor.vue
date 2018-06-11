<template>
  <div id="md-editor-container">
    <div style="position: relative;" v-if="value != null">
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
        <form-section v-bind="sectionBinds('Sample_Information')" v-on="sectionEvents('Sample_Information')"/>
        <form-section v-bind="sectionBinds('Sample_Preparation')" v-on="sectionEvents('Sample_Preparation')"/>
        <form-section v-bind="sectionBinds('Submitted_By')" v-on="sectionEvents('Submitted_By')"/>
        <form-section v-bind="sectionBinds('MS_Analysis')" v-on="sectionEvents('MS_Analysis')"/>
        <form-section v-bind="sectionBinds('metaspace_options')" v-on="sectionEvents('metaspace_options')"/>
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
 import {deriveFullSchema} from './formStructure';
 import {get, set, isArray, isEqual, isPlainObject, mapValues, forEach, without} from 'lodash-es';
 import {
   fetchAutocompleteSuggestionsQuery,
   fetchMetadataQuery,
   metadataOptionsQuery
 } from '../../api/metadata';
 import DatabaseDescriptions from '../DatabaseDescriptions.vue';
 import FormSection from './FormSection.vue';

 const factories = {
   'string': schema => schema.default || '',
   'number': schema => schema.default || 0,
   'object': schema => mapValues(schema.properties, prop => factories[prop.type](prop)),
   'array': schema => schema.default || [],
   'boolean': schema => schema.default || false,
 };

 const LOCAL_STORAGE_KEY = 'latestMetadataSubmission';
 const LOCAL_STORAGE_VERSION_KEY = 'latestMetadataSubmissionVersion';

 // TODO: fill in institution automatically when user profiles are added

 export default {
   name: 'metadata-editor',
   props: {
     datasetId: String,
     enableSubmit: Boolean,
     disabledSubmitMessage: String,
     validationErrors: Array,
   },
   components: {
     FormSection,
   },

   created() {
     this.loadForm();
   },

   data() {
     return {
       value: null,
       isPublic: true,
       schema: null,
       molecularDatabases: [],
       possibleAdducts: {},
     }
   },

   watch: {
     '$store.getters.filter.metadataType'(newMdType) {
       if (this.isNew && newMdType !== this.value.Data_Type) {
         this.saveForm();
         this.loadForm();
       }
     }
   },

   computed: {
     errors() {
       let errors = {};
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
         'Submitted_By',
         'MS_Analysis',
         'metaspace_options',
       ];
       return without(allSections, ...specialSections);
     }
   },
   methods: {
     getAugmentedSchema(mdType) {
       const schema = deriveFullSchema(metadataSchemas[mdType]);

       schema.properties.metaspace_options.properties.Metabolite_Database.smEditorHelp = DatabaseDescriptions;

       // Instead of imperatively updating the schema every time something changes, use getters so that anything
       // that watches the schema automatically subscribes to the correct data source.

       Object.defineProperty(schema.properties.metaspace_options.properties.Adducts.items, 'enum', {
         get: () => this.possibleAdducts[get(this.value, ['MS_Analysis', 'Polarity'] || 'Positive')],
       });

       Object.defineProperty(schema.properties.metaspace_options.properties.Metabolite_Database.items, 'enum', {
         get: () => this.molecularDatabases,
       });

       return schema;
     },

     async loadDataset() {
       if (!this.datasetId) {
         // no datasetId means a new dataset => help filling out by loading the last submission
         try {
           const lastFormValueJson = localStorage.getItem(LOCAL_STORAGE_KEY);
           if (lastFormValueJson) {
             return {
               metadata: JSON.parse(lastFormValueJson),
               isPublic: true,
             }
           }
         } catch (err) {
           Raven.captureException(err);
         }
         return null;
       } else {
         const {data} = await this.$apollo.query({
           query: fetchMetadataQuery,
           variables: {id: this.datasetId},
           fetchPolicy: 'network-only'
         });
         return {
           metadata: JSON.parse(data.dataset.metadataJson),
           isPublic: data.dataset.isPublic,
         }
       }
     },

     async loadOptions() {
       const {data} = await this.$apollo.query({
         query: metadataOptionsQuery,
       });
       return data;
     },

     async loadForm() {
       const [dataset, options] = await Promise.all([this.loadDataset(), this.loadOptions()]);
       const loadedMetadata = dataset && dataset.metadata;
       const isPublic = (dataset && dataset.isPublic) !== false; // Default to true
       const mdType = (
         this.isNew
           ? this.$store.getters.filter.metadataType
           : (loadedMetadata && loadedMetadata.Data_Type)
       ) || defaultMetadataType;
       const metadata = this.getDefaultMetadataValue(mdType);
       const {adducts, molecularDatabases} = options;

       // in case user just opened a link to metadata editing page w/o navigation in web-app,
       // filters are not set up
       this.$store.commit('updateFilter', {metadataType: mdType});
       metadata.Data_Type = mdType;

       // Copy loaded metadata over the top of the default value, but only include fields that actually exist and
       // are of the same type to avoid propagating outdated schema
       if (loadedMetadata != null) {
         forEach(loadedMetadata, (loadedSection, sectionKey) => {
           if (isPlainObject(metadata[sectionKey])) {
             forEach(loadedSection, (loadedField, fieldKey) => {
               if (fieldKey in metadata[sectionKey]) {
                 if (typeof loadedField === typeof metadata[sectionKey][fieldKey]) {
                   metadata[sectionKey][fieldKey] = loadedField;
                 } else if (!isArray(fieldValue) && isArray(metadata[sectionKey][fieldKey])) {
                   // Migrate Metabolite_Database
                   metadata[sectionKey][fieldKey] = [loadedField];
                 }
               }
             });
           }
         });
       }


       // Load options
       this.possibleAdducts = {
         'Positive': adducts.filter(a => a.charge > 0).map(a => a.adduct),
         'Negative': adducts.filter(a => a.charge < 0).map(a => a.adduct)
       };
       this.molecularDatabases = molecularDatabases.map(d => d.name);
       this.schema = this.getAugmentedSchema(mdType);

       if (this.isNew) {
         // If this is a form from localStorage and metabolite databases have changed since the form was submitted,
         // clear the databases so that the user has to re-pick. Otherwise populate it with the default databases
         // This is because we it's expensive to change database later. We want a smart default for new users,
         // but if the user has previously selected a value that is now invalid, they should be made aware so that they
         // can choose an appropriate substitute.
         const selectedDbs = get(metadata, ['metaspace_options', 'Metabolite_Database']) || [];
         if (selectedDbs.some(db => !this.molecularDatabases.includes(db))) {
           set(metadata, ['metaspace_options', 'Metabolite_Database'], []);
         } else if (selectedDbs.length === 0) {
           const defaultDbs = molecularDatabases.filter(d => d.default).map(d => d.name);
           set(metadata, ['metaspace_options', 'Metabolite_Database'], defaultDbs);
         }
         // Name should be different for each dataset
         set(metadata, ['metaspace_options', 'Dataset_Name'], '');
         // Populate submitter
         const user = this.$store.state.user;
         set(metadata, ['Submitted_By', 'Submitter', 'Email'], user ? user.email : '');
       }

       this.value = metadata;
       this.isPublic = isPublic;

       this.updateCurrentAdductOptions();
     },

     saveForm() {
       localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.value));
       localStorage.removeItem(LOCAL_STORAGE_VERSION_KEY); // No longer used
     },

     sectionBinds(sectionKey) {
       return {
         sectionKey,
         section: this.schema.properties[sectionKey],
         value: this.value[sectionKey],
         error: this.errors && this.errors[sectionKey],
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

     cancel() {
       this.$router.go(-1);
     },

     updateCurrentAdductOptions() {
       const adductsForPolarity = this.schema.properties.metaspace_options.properties.Adducts.items.enum;
       const selectedAdducts = this.value.metaspace_options.Adducts;
       let newAdducts = selectedAdducts.filter(adduct => adductsForPolarity.includes(adduct))
       // Default to selecting all valid adducts (at least until the less common adducts are added)
       if (newAdducts.length === 0 && selectedAdducts.length !== 0) {
         newAdducts = adductsForPolarity.slice();
       }
       this.value.metaspace_options.Adducts = newAdducts;
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
         this.saveForm();
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
       this.value.metaspace_options.Dataset_Name = name;
     },
   }
 }
</script>

<style>

 #md-editor-container {
   display: flex;
   justify-content: center;
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

 #md-section-list {
   display: flex;
   flex-direction: column;
 }

 #load-indicator {
   min-height: 300px;
 }

</style>
