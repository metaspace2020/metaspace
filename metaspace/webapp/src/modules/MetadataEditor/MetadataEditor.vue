<template>
  <div id="md-editor-container">
    <div
      v-if="value != null"
      style="position: relative;"
    >
      <div id="md-section-list">
        <form-section
          v-bind="sectionBinds('Sample_Information')"
          v-on="sectionEvents('Sample_Information')"
        />
        <form-section
          v-bind="sectionBinds('Sample_Preparation')"
          v-on="sectionEvents('Sample_Preparation')"
        />
        <form-section
          v-bind="sectionBinds('MS_Analysis')"
          v-on="sectionEvents('MS_Analysis')"
        />
        <data-management-section
          v-model="metaspaceOptions"
          :error="errors['metaspaceOptions']"
          :submitter="submitter"
        />
        <visibility-option-section :is-public.sync="metaspaceOptions.isPublic" />
        <metaspace-options-section
          v-model="metaspaceOptions"
          :error="errors['metaspaceOptions']"
          :databases-by-group="molDBsByGroup"
          :adduct-options="adductOptions"
          :is-new-dataset="isNew"
        />
        <form-section
          v-for="sectionKey in otherSections"
          :key="sectionKey"
          v-bind="sectionBinds(sectionKey)"
          v-on="sectionEvents(sectionKey)"
        />
      </div>
    </div>
    <div
      v-else
      id="load-indicator"
      v-loading="true"
    />
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

import { defaultMetadataType, metadataSchemas } from '../../lib/metadataRegistry'
import { deriveFullSchema } from './formStructure'
import {
  get, set, cloneDeep, defaults,
  isEmpty, isEqual, isPlainObject,
  mapValues, forEach, without, omit,
  sortBy,
} from 'lodash-es'
import {
  newDatasetQuery,
  fetchAutocompleteSuggestionsQuery,
  editDatasetQuery,
  metadataOptionsQuery,
  datasetSubmitterQuery,
  editDatasetSubmitterQuery,
} from '../../api/metadata'
import MetaspaceOptionsSection from './sections/MetaspaceOptionsSection.vue'
import VisibilityOptionSection from './sections/VisibilityOptionSection.vue'
import FormSection from './sections/FormSection.vue'
import DataManagementSection from './sections/DataManagementSection.vue'
import emailRegex from '../../lib/emailRegex'
import safeJsonParse from '../../lib/safeJsonParse'
import config from '../../lib/config'
import { getDatabasesByGroup } from '../MolecularDatabases/formatting'

const factories = {
  string: schema => schema.default || '',
  number: schema => schema.default || 0,
  object: schema => mapValues(schema.properties, prop => factories[prop.type](prop)),
  array: schema => schema.default || [],
  boolean: schema => schema.default || false,
}

const defaultMetaspaceOptions = {
  isPublic: true,
  databaseIds: [],
  adducts: [],
  name: '',
  submitterId: null,
  groupId: null,
  projectIds: [],
}

export default {
  name: 'MetadataEditor',
  components: {
    FormSection,
    MetaspaceOptionsSection,
    VisibilityOptionSection,
    DataManagementSection,
  },
  props: {
    datasetId: String,
    validationErrors: Array,
  },

  data() {
    return {
      value: null,
      schema: null,
      loadingPromise: null,
      localErrors: {},
      molDBsByGroup: [],
      possibleAdducts: {},
      metaspaceOptions: cloneDeep(defaultMetaspaceOptions),
      submitter: null,
      initialValue: null,
      initialMetaspaceOptions: null,
    }
  },

  computed: {
    errors() {
      const errors = cloneDeep(this.localErrors);
      (this.validationErrors || []).forEach(err => set(errors, err.dataPath.split('.').slice(1), err.message))
      return errors
    },
    isNew() {
      return this.datasetId == null
    },
    otherSections() {
      const allSections = Object.keys(this.schema.properties)
      const specialSections = [
        'Data_Type',
        'Sample_Information',
        'Sample_Preparation',
        'MS_Analysis',
      ]
      return without(allSections, ...specialSections)
    },
    adductOptions() {
      const polarity = get(this.value, ['MS_Analysis', 'Polarity']) || 'Positive'
      return this.possibleAdducts[polarity].map(({ adduct, name, ...ad }) => ({
        ...ad,
        value: adduct,
        // Without the feature flag, keep old-style names e.g. +H instead of [M+H]⁺
        label: config.features.all_adducts ? name : adduct,
      }))
    },
  },

  watch: {
    '$store.getters.filter.metadataType'(newMdType) {
      if (this.isNew && newMdType !== this.value.Data_Type) {
        this.reloadForm(newMdType)
      }
    },
    async 'metaspaceOptions.submitterId'(newSubmitterId) {
      if (newSubmitterId != null && (this.submitter == null || this.submitter.id !== newSubmitterId)) {
        const result = await this.$apollo.query({
          query: datasetSubmitterQuery,
          variables: { userId: newSubmitterId },
        })
        this.submitter = result.data.user
      }
    },
  },

  created() {
    this.loadingPromise = this.initializeForm()
  },
  methods: {
    async loadDataset() {
      const metaspaceOptionsFromDataset = (dataset, isNew) => {
        const {
          isPublic, configJson, databases, adducts,
          name, group, projects, submitter, principalInvestigator,
        } = dataset
        const config = safeJsonParse(configJson)
        return {
          submitterId: submitter ? submitter.id : null,
          groupId: group ? group.id : null,
          projectIds: projects ? projects.map(p => p.id) : [],
          principalInvestigator: principalInvestigator == null ? null : omit(principalInvestigator, '__typename'),
          isPublic,
          databaseIds: databases.map(_ => _.id),
          adducts,
          name,
          neutralLosses: isNew ? [] : get(config, 'isotope_generation.neutral_losses') || [],
          chemMods: isNew ? [] : get(config, 'isotope_generation.chem_mods') || [],
          numPeaks: isNew ? null : get(config, 'isotope_generation.n_peaks') || null,
          decoySampleSize: isNew ? null : get(config, 'fdr.decoy_sample_size') || null,
          ppm: isNew ? null : get(config, 'image_generation.ppm') || null,
          analysisVersion: isNew ? 1 : get(config, 'analysis_version') || 1,
        }
      }

      if (!this.datasetId) {
        const { data } = await this.$apollo.query({
          query: newDatasetQuery,
        })
        const dataset = data.currentUserLastSubmittedDataset

        return {
          metadata: dataset && safeJsonParse(dataset.metadataJson) || {},
          metaspaceOptions: {
            ...(dataset != null ? metaspaceOptionsFromDataset(dataset, true) : null),
            submitterId: this.$store.state.currentTour ? null : data.currentUser.id,
            groupId: this.$store.state.currentTour ? null
              : data.currentUser.primaryGroup && data.currentUser.primaryGroup.group.id,
          },
          submitter: data.currentUser,
          databases: dataset ? dataset.databases : [],
        }
      } else {
        const { data } = await this.$apollo.query({
          query: editDatasetQuery,
          variables: { id: this.datasetId },
        })
        let submitter
        // If submitter is not the current user, we need to make a second request after finding the submitter's userId
        // to get the rest of the submitter data (groups, projects, etc.)
        if (data.currentUser != null && data.dataset.submitter.id === data.currentUser.id) {
          submitter = data.currentUser
        } else {
          const { data: submitterData } = await this.$apollo.query({
            query: editDatasetSubmitterQuery,
            variables: { userId: data.dataset.submitter.id },
          })
          submitter = submitterData.user
        }
        return {
          metadata: JSON.parse(data.dataset.metadataJson),
          metaspaceOptions: metaspaceOptionsFromDataset(data.dataset, false),
          submitter,
          databases: data.dataset.databases,
        }
      }
    },

    async loadOptions() {
      const { data } = await this.$apollo.query({
        query: metadataOptionsQuery,
        fetchPolicy: 'network-only',
      })
      return {
        ...data,
        adducts: config.features.all_adducts
          ? data.adducts
          : data.adducts.filter(ad => !ad.hidden),
      }
    },

    async initializeForm() {
      const [dataset, options] = await Promise.all([this.loadDataset(), this.loadOptions()])
      const mdType = (
        this.isNew
          ? this.$store.getters.filter.metadataType
          : (dataset && dataset.metadata && dataset.metadata.Data_Type)
      ) || defaultMetadataType
      await this.loadForm(dataset, options, mdType)
    },

    async reloadForm(mdType) {
      const dataset = {
        metadata: this.value,
        metaspaceOptions: this.metaspaceOptions,
      }
      await this.loadForm(dataset, await this.loadOptions(), mdType)
    },

    async loadForm(dataset, options, mdType) {
      const loadedMetadata = dataset.metadata
      const metaspaceOptions = defaults({}, dataset.metaspaceOptions, defaultMetaspaceOptions)

      // in case user just opened a link to metadata editing page w/o navigation in web-app,
      // filters are not set up
      this.$store.commit('updateFilter', { metadataType: mdType })
      const metadata = this.importMetadata(loadedMetadata, mdType)

      // Load options
      const { adducts, molecularDatabases } = options
      this.possibleAdducts = {
        Positive: adducts.filter(a => a.charge > 0),
        Negative: adducts.filter(a => a.charge < 0),
      }
      this.molDBsByGroup = getDatabasesByGroup(molecularDatabases)
      this.schema = deriveFullSchema(metadataSchemas[mdType])

      if (this.isNew) {
        // If this is a prepopulated form from a previous submission and metabolite databases have changed since that submission,
        // clear the databases so that the user has to re-pick. Otherwise populate it with the default databases.
        // This is because it's expensive to change database later. We want a smart default for new users,
        // but if the user has previously selected a value that is now invalid, they should be made aware so that they
        // can choose an appropriate substitute.
        const selectedDbs = dataset.databases || []
        if (selectedDbs.length === 0) {
          metaspaceOptions.databaseIds = molecularDatabases.filter(d => d.default).map(_ => _.id)
        } else {
          for (const db of selectedDbs) {
            if (molecularDatabases.find(_ => _.id === db.id) === undefined) {
              metaspaceOptions.databaseIds = []
              break
            }
          }
        }
        // Name should be different for each dataset
        metaspaceOptions.name = ''
      }

      this.value = metadata
      this.metaspaceOptions = metaspaceOptions
      this.initialValue = cloneDeep(metadata)
      this.initialMetaspaceOptions = cloneDeep(metaspaceOptions)
      if (dataset.submitter != null) {
        this.submitter = dataset.submitter
      }

      this.updateCurrentAdductOptions()
    },

    importMetadata(loadedMetadata, mdType) {
      const metadata = this.getDefaultMetadataValue(mdType)
      metadata.Data_Type = mdType

      // Copy loaded metadata over the top of the default value, but only include fields that actually exist and
      // are of the same type to avoid propagating outdated schema
      if (loadedMetadata != null) {
        forEach(loadedMetadata, (loadedSection, sectionKey) => {
          if (isPlainObject(metadata[sectionKey])) {
            forEach(loadedSection, (loadedField, fieldKey) => {
              if (fieldKey in metadata[sectionKey]) {
                if (typeof loadedField === typeof metadata[sectionKey][fieldKey]) {
                  metadata[sectionKey][fieldKey] = cloneDeep(loadedField)
                }
              }
            })
          }
        })
      }

      return metadata
    },

    validate() {
      const errors = {}

      const { databaseIds, adducts, name, groupId, principalInvestigator } = this.metaspaceOptions

      if (isEmpty(databaseIds)) {
        set(errors, ['metaspaceOptions', 'databaseIds'], 'should have at least 1 selection')
      }
      if (isEmpty(adducts)) {
        set(errors, ['metaspaceOptions', 'adducts'], 'should have at least 1 selection')
      }
      if (!name || name.length < 5) {
        set(errors, ['metaspaceOptions', 'name'], 'should be at least 5 characters')
      } else if (name.length > 250) {
        set(errors, ['metaspaceOptions', 'name'], 'should be no more than 250 characters')
      }

      if (groupId == null && principalInvestigator == null) {
        set(errors, ['metaspaceOptions', 'groupId'], 'select a group')
      }
      if (principalInvestigator != null) {
        const piName = principalInvestigator.name || ''
        const piEmail = principalInvestigator.email || ''
        if (!groupId || piName.length > 0 || piEmail.length > 0) {
          if (piName.length < 4) {
            set(errors, ['metaspaceOptions', 'principalInvestigator', 'name'], 'should be at least 4 characters')
          }
          if (!emailRegex.test(principalInvestigator.email)) {
            set(errors, ['metaspaceOptions', 'principalInvestigator', 'email'], 'should be a valid email address')
          }
        }
      }

      this.localErrors = errors
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
        input: this.onInput,
      }
    },

    onInput(path, val) {
      set(this.value, path, val)

      if (isEqual(path, ['MS_Analysis', 'Polarity'])) {
        this.updateCurrentAdductOptions()
      }
    },

    getDefaultMetadataValue(metadataType) {
      return factories.object(metadataSchemas[metadataType])
    },

    updateCurrentAdductOptions() {
      const selectedAdducts = this.metaspaceOptions.adducts
      let newAdducts = selectedAdducts.filter(adduct => this.adductOptions.some(option => option.value === adduct))
      // If no selected adducts are still valid, reset to the default adducts
      if (newAdducts.length === 0) {
        newAdducts = this.adductOptions
          .filter(option => option.default)
          .map(option => option.value)
      }
      this.metaspaceOptions.adducts = newAdducts
    },

    resetAfterSubmit() {
      this.metaspaceOptions.name = ''
      this.localErrors = {}
    },

    resetMetaboliteDatabase() {
      this.metaspaceOptions.databaseIds = []
    },

    getFormValueForSubmit() {
      this.validate()
      if (!isEmpty(this.localErrors)) {
        this.$message({
          message: 'Please check that you entered metadata correctly!',
          type: 'warning',
        })
        return null
      }

      return {
        datasetId: this.datasetId ? this.datasetId : '',
        metadataJson: JSON.stringify(this.value),
        metaspaceOptions: this.metaspaceOptions,
        initialMetadataJson: JSON.stringify(this.initialValue),
        initialMetaspaceOptions: this.initialMetaspaceOptions,
      }
    },

    getSuggestionsForField(query, callback, ...args) {
      const path = args.join('.')
      this.$apollo.query({
        query: fetchAutocompleteSuggestionsQuery,
        variables: { field: path, query: query || '' },
      }).then(resp => callback(resp.data.metadataSuggestions.map(val => ({ value: val }))))
    },

    /* for outside access from the upload page, to autofill it with the filename */
    fillDatasetName(name) {
      this.metaspaceOptions.name = name
    },
  },
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
