<template>
  <div id="md-editor-container w-full">
    <div v-if="state.value != null" style="position: relative">
      <div id="md-section-list">
        <div v-if="isNew" class="flex flex-row w-full flex-wrap mt-6 justify-end">
          <el-popover trigger="click" placement="left">
            <template #reference>
              <el-button type="primary" class="mr-1">
                Copy metadata from another dataset...<el-icon class="ml-1"><DocumentCopy /></el-icon>
              </el-button>
            </template>
            <div class="max-w-sm">
              <el-select
                v-model="state.metadataTemplate"
                placeholder="Start typing name"
                remote
                filterable
                clearable
                :remote-method="fetchDatasets"
                :loading="state.loadingTemplates"
                loading-text="Loading matching entries..."
                no-match-text="No matches"
                @change="metadataTemplateSelection"
              >
                <el-option
                  v-for="option in state.templateOptions"
                  :key="option.id"
                  :value="option.id"
                  :label="option.name"
                />
              </el-select>
            </div>
          </el-popover>
        </div>
        <div class="flex flex-row w-full flex-wrap mt-6">
          <div class="metadata-section__title w-3/12">Dataset description</div>
          <rich-text
            id="description-container"
            :content="state.metaspaceOptions.description"
            :auto-focus="true"
            :hide-state-status="true"
            :readonly="false"
            :update="handleDescriptionChange"
            content-class-name="customEditor"
          />
        </div>
        <form-section v-bind="sectionBinds('Sample_Information')" v-on="sectionEvents('Sample_Information')" />
        <form-section v-bind="sectionBinds('Sample_Preparation')" v-on="sectionEvents('Sample_Preparation')" />
        <form-section v-bind="sectionBinds('MS_Analysis')" v-on="sectionEvents('MS_Analysis')" />
        <data-management-section
          :value="state.metaspaceOptions"
          :error="errors['metaspaceOptions']"
          :submitter="state.submitter"
          @change="onOptionChange"
        />
        <visibility-option-section :is-public="state.metaspaceOptions.isPublic" @change="handleVisibilityChange" />
        <metaspace-options-section
          :value="state.metaspaceOptions"
          :error="errors['metaspaceOptions']"
          :databases-by-group="state.molDBsByGroup"
          :default-db="state.defaultDb"
          :adduct-options="adductOptions"
          :is-new-dataset="isNew"
          :scoring-models="state.scoringModels"
          @change="onOptionChange"
        />
        <form-section
          v-for="sectionKey in otherSections"
          :key="sectionKey"
          v-bind="sectionBinds(sectionKey)"
          v-on="sectionEvents(sectionKey)"
        />
      </div>
    </div>
    <div v-else id="load-indicator" v-loading="true" />
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
import { defineComponent, reactive, computed, watch, inject, onBeforeMount } from 'vue'
import { useStore } from 'vuex'
import { ElPopover, ElButton, ElSelect, ElOption, ElMessage, ElLoading, ElIcon } from '../../lib/element-plus'
import RichText from '../../components/RichText/RichText'
import FormSection from './sections/FormSection.vue'
import MetaspaceOptionsSection from './sections/MetaspaceOptionsSection.vue'
import VisibilityOptionSection from './sections/VisibilityOptionSection.vue'
import DataManagementSection from './sections/DataManagementSection.vue'
import {
  get,
  set,
  cloneDeep,
  defaults,
  isEmpty,
  isEqual,
  isPlainObject,
  mapValues,
  forEach,
  without,
  omit,
  uniq,
  omitBy,
  isNil,
} from 'lodash-es'
import { DefaultApolloClient } from '@vue/apollo-composable'
import { defaultMetadataType, metadataSchemas } from '../../lib/metadataRegistry'
import { getDatabasesByGroup } from '../MolecularDatabases/formatting'
import { deriveFullSchema } from './formStructure'
import {
  newDatasetQuery,
  fetchAutocompleteSuggestionsQuery,
  editDatasetQuery,
  metadataOptionsQuery,
  datasetSubmitterQuery,
  editDatasetSubmitterQuery,
} from '../../api/metadata'
import safeJsonParse from '../../lib/safeJsonParse'
import isValidTiptapJson from '../../lib/isValidTiptapJson'
import { datasetListItemsQuery } from '../../api/dataset'
import emailRegex from '../../lib/emailRegex'
import config from '../../lib/config'
import { DocumentCopy } from '@element-plus/icons-vue'

const factories = {
  string: (schema) => schema.default || '',
  number: (schema) => schema.default || 0,
  object: (schema) => mapValues(schema.properties, (prop) => factories[prop.type](prop)),
  array: (schema) => schema.default || [],
  boolean: (schema) => schema.default || false,
}

const defaultMetaspaceOptions = {
  isPublic: true,
  databaseIds: [],
  adducts: [],
  name: '',
  submitterId: null,
  groupId: null,
  projectIds: [],
  ppm: 3,
}
export default defineComponent({
  name: 'MetadataEditor',
  components: {
    ElPopover,
    ElButton,
    ElSelect,
    ElOption,
    RichText,
    FormSection,
    MetaspaceOptionsSection,
    VisibilityOptionSection,
    DataManagementSection,
    ElIcon,
    DocumentCopy,
  },
  directives: {
    loading: ElLoading.directive,
  },
  props: {
    datasetId: String,
    currentUser: { type: Object },
    validationErrors: { type: Array, default: () => [] },
  },
  setup(props) {
    const store = useStore()
    const apolloClient = inject(DefaultApolloClient)

    const state = reactive({
      value: null,
      schema: null,
      loadingPromise: null,
      localErrors: {},
      defaultDb: null,
      molDBsByGroup: [],
      possibleAdducts: {},
      scoringModels: [],
      metaspaceOptions: cloneDeep(defaultMetaspaceOptions),
      submitter: null,
      initialValue: null,
      initialMetaspaceOptions: null,
      autoDatasetName: null,
      loadingTemplates: false,
      metadataTemplate: null,
      templateOptions: [],
    })

    const errors = computed(() => {
      const errors = cloneDeep(state.localErrors)
      props.validationErrors.forEach((err) => set(errors, err.dataPath.split('.').slice(1), err.message))
      return errors
    })

    const isNew = computed(() => props.datasetId == null)
    const otherSections = computed(() => {
      const allSections = Object.keys(state.schema?.properties)
      const specialSections = ['Data_Type', 'Sample_Information', 'Sample_Preparation', 'MS_Analysis']
      return without(allSections, ...specialSections)
    })
    const adductOptions = computed(() => {
      const polarity = get(state.value, ['MS_Analysis', 'Polarity']) || 'Positive'
      return state.possibleAdducts[polarity].map(({ adduct, name, ...ad }) => ({
        ...ad,
        value: adduct,
        label: name,
      }))
    })

    const metadataType = computed(() => store.getters.filter?.metadataType)
    const dataType = computed(() => state.value?.Data_Type)

    const getDefaultMetadataValue = (metadataType) => {
      if (!metadataSchemas || !metadataSchemas[metadataType]) {
        return {}
      }
      return factories.object(metadataSchemas[metadataType])
    }

    const importMetadata = (loadedMetadata, mdType) => {
      const metadata = getDefaultMetadataValue(mdType)
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
    }

    const updateCurrentAdductOptions = () => {
      const selectedAdducts = state.metaspaceOptions.adducts || []
      let newAdducts = selectedAdducts.filter((adduct) => adductOptions.value.some((option) => option.value === adduct))
      // If no selected adducts are still valid, reset to the default adducts
      if (newAdducts.length === 0) {
        newAdducts = adductOptions.value.filter((option) => option.default).map((option) => option.value)
      }
      state.metaspaceOptions.adducts = newAdducts
    }

    const loadForm = async (dataset, options, mdType) => {
      const loadedMetadata = dataset.metadata
      const metaspaceOptions = defaults({}, omitBy(dataset.metaspaceOptions, isNil), defaultMetaspaceOptions)
      // in case user just opened a link to metadata editing page w/o navigation in web-app,
      // filters are not set up
      // store.commit('updateFilter', { metadataType: mdType })
      const metadata = importMetadata(loadedMetadata, mdType)

      // Load options
      const { adducts, molecularDatabases, scoringModels } = options
      state.possibleAdducts = {
        Positive: adducts.filter((a) => a.charge > 0),
        Negative: adducts.filter((a) => a.charge < 0),
      }
      state.scoringModels = scoringModels
      state.defaultDb = molecularDatabases.find((db) => db.default) || {}
      state.molDBsByGroup = getDatabasesByGroup(molecularDatabases)
      state.schema = deriveFullSchema(metadataSchemas[mdType])

      // TODO remove the additional information from the schema itself at some point
      // hide additional info from dataset upload, without changing schema for compatibility reasons
      if (state.schema && state.schema.properties && state.schema.properties.Additional_Information) {
        delete state.schema.properties.Additional_Information
      }

      const selectedDbs = dataset.databases || []

      // backward compatibility
      if (!metaspaceOptions.scoringModelId) {
        metaspaceOptions.scoringModelId = (scoringModels.find((m) => m.type === 'original') || {}).id
      } else {
        const currentModel =
          scoringModels.find((m) => m.id === metaspaceOptions.scoringModelId) ||
          // keep for backward compatibility to scoring model (v3_default)
          scoringModels.find((m) => m.name === metaspaceOptions.scoringModelId) ||
          {}
        metaspaceOptions.scoringModelId = currentModel.id
      }

      // enable default db normal edit if dataset already registered and does not have it
      state.defaultDb =
        !isNew.value && !selectedDbs.map((db) => db.id).includes(state.defaultDb.id) ? {} : state.defaultDb

      if (isNew.value) {
        // If this is a prepopulated form from a previous submission and metabolite databases have changed since that submission,
        // clear the databases so that the user has to re-pick. Otherwise populate it with the default databases.
        // This is because it's expensive to change database later. We want a smart default for new users,
        // but if the user has previously selected a value that is now invalid, they should be made aware so that they
        // can choose an appropriate substitute.
        metaspaceOptions.databaseIds = uniq(
          selectedDbs.map((db) => db.id).concat(molecularDatabases.filter((d) => d.default).map((_) => _.id))
        )
        if (selectedDbs.length > 0) {
          for (const db of selectedDbs) {
            if (molecularDatabases.find((_) => _.id === db.id) === undefined) {
              metaspaceOptions.databaseIds = molecularDatabases.filter((d) => d.default).map((_) => _.id)
              break
            }
          }
        }
        // Name should be different for each dataset
        metaspaceOptions.name = ''
      }

      state.value = metadata
      state.metaspaceOptions = metaspaceOptions
      state.initialValue = cloneDeep(metadata)
      state.initialMetaspaceOptions = cloneDeep(metaspaceOptions)
      if (dataset.submitter != null) {
        state.submitter = dataset.submitter
      }

      updateCurrentAdductOptions()
    }

    const loadOptions = async () => {
      const { data } = await apolloClient.query({
        query: metadataOptionsQuery,
        fetchPolicy: 'network-only',
      })
      return {
        ...data,
        adducts: config.features.all_adducts ? data.adducts : data.adducts.filter((ad) => !ad.hidden),
      }
    }

    const reloadForm = async (mdType) => {
      const dataset = {
        metadata: state.value,
        metaspaceOptions: state.metaspaceOptions,
      }
      await loadForm(dataset, await loadOptions(), mdType)
    }

    const validate = () => {
      const errors = {}

      const { databaseIds, adducts, name, groupId, principalInvestigator, ppm } = state.metaspaceOptions

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
      if (!ppm) {
        set(errors, ['metaspaceOptions', 'ppm'], 'ppm cannot be blank')
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

      state.localErrors = errors
    }

    const getSuggestionsForField = async (query, callback, ...args) => {
      const path = args.join('.')
      await apolloClient
        .query({
          query: fetchAutocompleteSuggestionsQuery,
          variables: { field: path, query: query || '' },
        })
        .then((resp) => callback(resp.data.metadataSuggestions.map((val) => ({ value: val }))))
    }

    const sectionBinds = (sectionKey) => {
      return {
        sectionKey,
        section: state.schema.properties[sectionKey] || {},
        value: state.value[sectionKey] || {},
        error: errors.value[sectionKey],
        getSuggestionsForField,
      }
    }

    /* for outside access from the upload page, to autofill it with the filename */
    const fillDatasetName = (name) => {
      if (!state.metaspaceOptions.name || state.metaspaceOptions.name === state.autoDatasetName) {
        state.metaspaceOptions.name = state.autoDatasetName = name
      }
    }

    const onInput = (path, val) => {
      set(state.value, path, val)

      // recommend ppm to 10 if resolving power below 70000 and 3 if greater than 70000
      if (isNew.value && isEqual(path, ['MS_Analysis', 'Detector_Resolving_Power']) && val.Resolving_Power < 70000) {
        state.metaspaceOptions.ppm = 10
      } else if (
        isNew.value &&
        isEqual(path, ['MS_Analysis', 'Detector_Resolving_Power']) &&
        val.Resolving_Power >= 70000
      ) {
        state.metaspaceOptions.ppm = 3
      }

      if (isEqual(path, ['MS_Analysis', 'Polarity'])) {
        updateCurrentAdductOptions()
      }
    }

    const sectionEvents = () => {
      return {
        input: onInput,
      }
    }

    const handleDescriptionChange = (content) => {
      state.metaspaceOptions.description = content
    }

    const handleVisibilityChange = (isPublic) => {
      state.metaspaceOptions.isPublic = isPublic
    }
    const onOptionChange = ({ field, val }) => {
      state.metaspaceOptions[field] = val
    }

    const resetAfterSubmit = () => {
      state.metaspaceOptions.name = ''
      state.localErrors = {}
    }

    const resetMetaboliteDatabase = () => {
      state.metaspaceOptions.databaseIds = []
    }

    const getFormValueForSubmit = () => {
      validate()
      if (!isEmpty(state.localErrors)) {
        ElMessage({
          message: 'Please check that you entered metadata correctly!',
          type: 'warning',
        })
        return null
      }

      return {
        datasetId: props.datasetId ? props.datasetId : '',
        metadataJson: JSON.stringify(state.value),
        metaspaceOptions: state.metaspaceOptions,
        initialMetadataJson: JSON.stringify(state.initialValue),
        initialMetaspaceOptions: state.initialMetaspaceOptions,
      }
    }

    const metaspaceOptionsFromDataset = (dataset, isNew) => {
      const {
        isPublic,
        configJson,
        databases,
        adducts,
        name,
        group,
        projects,
        submitter,
        principalInvestigator,
        description,
        isEnriched,
      } = dataset

      const config = safeJsonParse(configJson)

      return {
        submitterId: submitter ? submitter.id : null,
        groupId: group ? group.id : null,
        projectIds: projects ? projects.map((p) => p.id) : [],
        principalInvestigator: principalInvestigator == null ? null : omit(principalInvestigator, '__typename'),
        description: isValidTiptapJson(safeJsonParse(description)) ? safeJsonParse(description) : null,
        isPublic,
        databaseIds: databases.map((_) => _.id),
        adducts,
        name,
        neutralLosses: isNew ? [] : get(config, 'isotope_generation.neutral_losses') || [],
        chemMods: isNew ? [] : get(config, 'isotope_generation.chem_mods') || [],
        numPeaks: isNew ? null : get(config, 'isotope_generation.n_peaks') || null,
        decoySampleSize: isNew ? null : get(config, 'fdr.decoy_sample_size') || null,
        ppm: isNew ? null : get(config, 'image_generation.ppm') || null,
        scoringModelId: get(config, 'fdr.scoring_model_id') || get(config, 'fdr.scoring_model'), // backward compatibility
        performEnrichment: isEnriched,
      }
    }

    const fetchUserData = async (retryCount = 0, maxRetries = 3) => {
      // fail safe when query fails on compenent start
      try {
        return await apolloClient.query({
          query: newDatasetQuery,
          fetchPolicy: 'network-only',
        })
      } catch (error) {
        if (retryCount < maxRetries) {
          return await fetchUserData(retryCount + 1, maxRetries)
        } else {
          throw new Error(`Could not fetch user info`)
        }
      }
    }
    const fetchDatasetData = async (retryCount = 0, maxRetries = 3) => {
      // fail safe when query fails on compenent start
      try {
        return await apolloClient.query({
          query: editDatasetQuery,
          variables: { id: props.datasetId },
          fetchPolicy: 'network-only',
        })
      } catch (error) {
        if (retryCount < maxRetries) {
          return await fetchDatasetData(retryCount + 1, maxRetries)
        } else {
          throw new Error(`Could not fetch user info`)
        }
      }
    }

    const loadDataset = async () => {
      try {
        if (!props.datasetId) {
          const result = await fetchUserData()
          const data = result.data
          const dataset = data.currentUserLastSubmittedDataset

          return {
            metadata: (dataset && safeJsonParse(dataset.metadataJson)) || {},
            metaspaceOptions: {
              ...(dataset != null ? metaspaceOptionsFromDataset(dataset, true) : null),
              submitterId: store.state.currentTour ? null : data.currentUser.id,
              groupId: store.state.currentTour
                ? null
                : data.currentUser.primaryGroup && data.currentUser.primaryGroup.group.id,
            },
            submitter: data.currentUser,
            databases: dataset ? dataset.databases : [],
          }
        } else {
          const result = await fetchDatasetData()
          const data = result.data
          let submitter
          // If submitter is not the current user, we need to make a second request after finding the submitter's userId
          // to get the rest of the submitter data (groups, projects, etc.)
          if (data.currentUser != null && data.dataset.submitter.id === data.currentUser.id) {
            submitter = data.currentUser
          } else {
            const { data: submitterData } = await apolloClient.query({
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
      } catch (e) {
        return {
          metadata: {},
          metaspaceOptions: {},
          databases: [],
          submitter: props.currentUser || {},
        }
      }
    }

    const fetchDatasets = async (name) => {
      state.loadingTemplates = true
      try {
        const resp = await apolloClient.query({
          query: datasetListItemsQuery,
          variables: {
            dFilter: {
              metadataType: 'Imaging MS',
              submitter: state.submitter.id,
              name,
            },
            orderBy: 'ORDER_BY_DATE',
            sortingOrder: 'DESCENDING',
            query: '',
            limit: 10,
          },
        })
        state.templateOptions = resp.data.allDatasets
      } catch (e) {
        // pass
        // reportError(e)
      } finally {
        state.loadingTemplates = false
      }
    }

    const metadataTemplateSelection = async (datasetId) => {
      try {
        const { data } = await apolloClient.query({
          query: editDatasetQuery,
          variables: { id: datasetId },
        })
        const dataset = {
          metadata: (data.dataset && safeJsonParse(data.dataset.metadataJson)) || {},
          metaspaceOptions: {
            ...(data.dataset != null ? metaspaceOptionsFromDataset(data.dataset, true) : null),
            submitterId: store.state.currentTour ? null : data.currentUser.id,
            groupId: store.state.currentTour
              ? null
              : data.currentUser.primaryGroup && data.currentUser.primaryGroup.group.id,
          },
          submitter: data.currentUser,
          databases: data.dataset ? data.dataset.databases : [],
        }
        await loadForm(dataset, await loadOptions(), dataset.metadata.Data_Type || 'Imaging MS')
      } catch (e) {
        reportError(e)
      }
    }
    const initializeForm = async () => {
      const [dataset, options] = await Promise.all([loadDataset(), loadOptions()])
      const mdType =
        (isNew.value ? store.getters.filter.metadataType : dataset && dataset.metadata && dataset.metadata.Data_Type) ||
        defaultMetadataType
      await loadForm(dataset, options, mdType)
      if (isNew.value) {
        await fetchDatasets()
      }
    }

    watch(metadataType, (newMdType) => {
      if (isNew.value && newMdType !== dataType.value) {
        reloadForm(newMdType)
      }
    })

    watch(
      () => state.metaspaceOptions.submitterId,
      async (newSubmitterId) => {
        if (newSubmitterId != null && (state.submitter == null || state.submitter.id !== newSubmitterId)) {
          const result = await apolloClient.query({
            query: datasetSubmitterQuery,
            variables: { userId: newSubmitterId },
          })
          state.submitter = result.data.user
        }
      }
    )

    onBeforeMount(() => {
      state.loadingPromise = initializeForm()
    })

    return {
      errors,
      isNew,
      otherSections,
      adductOptions,
      state,
      fetchDatasets,
      metadataTemplateSelection,
      sectionBinds,
      sectionEvents,
      handleDescriptionChange,
      fillDatasetName,
      handleVisibilityChange,
      onOptionChange,
      getFormValueForSubmit,
      resetMetaboliteDatabase,
      resetAfterSubmit,
    }
  },
})
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

#description-container {
  @apply p-0 border rounded border-solid;
  width: calc(75% - 10px);
  border-color: #bccddc;
  margin-left: 4px;
  overflow: hidden;
}

#description-container > div > div > div {
  @apply p-2;
  min-height: calc(50px - 1rem);
  background: #f1f5f8;
}

.focus-visible {
  outline: 1px solid hsl(208, 87%, 50%);
  outline-offset: 1px;
}

#description-container > div > div > div > p {
}
</style>
