<template>
  <div id="md-editor-container w-full">
    <div v-if="state.loadFailed" class="text-danger font-medium p-4">
      This dataset could not be loaded. Nothing has been changed; refresh the page or contact us
      <a href="/contact" target="_blank">here</a> if the problem persists.
    </div>
    <div v-else-if="state.loaded" style="position: relative">
      <div id="md-section-list">
        <migration-banner v-if="v2Mode === 'legacy'" :status="v2Status" :failed-slots="v2FailedSlots" />
        <metadata-v2-section :form="v2" :description-text="descriptionText">
          <template v-if="isNew" #headerActions>
            <el-popover trigger="click" placement="bottom-end" :width="320">
              <template #reference>
                <el-button size="small" class="md-copy-from-dataset">⧉ Copy from another dataset…</el-button>
              </template>
              <el-select
                v-model="state.metadataTemplate"
                class="w-full"
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
            </el-popover>
          </template>
          <template #description>
            <rich-text
              id="description-container"
              :content="state.metaspaceOptions.description"
              :auto-focus="true"
              :hide-state-status="true"
              :readonly="false"
              :update="handleDescriptionChange"
              content-class-name="customEditor"
            />
          </template>
        </metadata-v2-section>
        <section-card class="md-data-management" title="Data management" subtitle="submitter, group, quota, visibility">
          <template #headerRight>
            <required-counter :filled="dataManagementFilled" :total="2" />
          </template>
          <data-management-section
            :value="state.metaspaceOptions"
            :error="errors['metaspaceOptions']"
            :submitter="state.submitter"
            :is-new-dataset="isNew"
            @change="onOptionChange"
          />
          <visibility-option-section
            :is-public="state.metaspaceOptions.isPublic"
            :disable-public="publicDisabled"
            :disabled-reason="publicDisabledReason"
            @change="handleVisibilityChange"
          />
        </section-card>
        <section-card
          class="md-annotation-settings"
          title="Annotation settings"
          subtitle="metabolite database, adducts, processing parameters"
        >
          <template #headerRight>
            <required-counter :filled="annotationSettingsFilled" :total="5" />
          </template>
          <metaspace-options-section
            :value="state.metaspaceOptions"
            :error="errors['metaspaceOptions']"
            :databases-by-group="state.molDBsByGroup"
            :ontology-dbs="state.ontologyDbs"
            :default-db="state.defaultDb"
            :adduct-options="adductOptions"
            :is-new-dataset="isNew"
            :scoring-models="state.scoringModels"
            @change="onOptionChange"
          />
        </section-card>
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

    Metadata lives in the schema v2 envelope owned by useMetadataV2Form; legacy (ims.json) datasets are
    migrated into it on load. If datasetId is provided, the component fetches that dataset from the GraphQL
    server so that it can be edited.

    On submit, getFormValueForSubmit() checks the form for validity and, if valid, hands the pages
    metadataV2Json plus the metaspace options (and their initial values, for change detection).
  */
import { defineComponent, reactive, computed, watch, inject, onBeforeMount } from 'vue'
import { useStore } from 'vuex'
import { ElPopover, ElButton, ElSelect, ElOption, ElMessage, ElLoading } from '../../lib/element-plus'
import RichText from '../../components/RichText/RichText'
import MetaspaceOptionsSection from './sections/MetaspaceOptionsSection.vue'
import VisibilityOptionSection from './sections/VisibilityOptionSection.vue'
import DataManagementSection from './sections/DataManagementSection.vue'
import { get, set, cloneDeep, defaults, isEmpty, omit, uniq, omitBy, isNil } from 'lodash-es'
import { DefaultApolloClient } from '@vue/apollo-composable'
import { getDatabasesByGroup } from '../MolecularDatabases/formatting'
import {
  newDatasetQuery,
  editDatasetQuery,
  metadataOptionsQuery,
  datasetSubmitterQuery,
  editDatasetSubmitterQuery,
} from '../../api/metadata'
import safeJsonParse from '../../lib/safeJsonParse'
import reportError from '../../lib/reportError'
import isValidTiptapJson from '../../lib/isValidTiptapJson'
import { datasetListItemsQuery } from '../../api/dataset'
import emailRegex from '../../lib/emailRegex'
import config from '../../lib/config'
import { nestEnrichmentDbs } from '../../lib/util'
import { MetadataV2Section } from './v2/components/MetadataV2Section'
import { MigrationBanner } from './v2/components/MigrationBanner'
import { RequiredCounter, SectionCard } from './v2/components/SectionCard'
import { useMetadataV2Form } from './v2/useMetadataV2Form'
import { setAtPath } from './v2/envelope'
import { createTermResolver, createValueResolver } from './v2/termResolver'
import { tiptapToPlainText } from './v2/descriptionText'

const defaultMetaspaceOptions = {
  isPublic: true,
  databaseIds: [],
  ontologyDbIds: [],
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
    MetadataV2Section,
    MigrationBanner,
    SectionCard,
    RequiredCounter,
    MetaspaceOptionsSection,
    VisibilityOptionSection,
    DataManagementSection,
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
    const v2 = useMetadataV2Form(createTermResolver(apolloClient), createValueResolver(apolloClient))

    const state = reactive({
      loaded: false,
      loadFailed: false,
      loadingPromise: null,
      localErrors: {},
      defaultDb: null,
      molDBsByGroup: [],
      ontologyDbs: [],
      possibleAdducts: {},
      scoringModels: [],
      metaspaceOptions: cloneDeep(defaultMetaspaceOptions),
      submitter: null,
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
    const adductOptions = computed(() => {
      const polarity = v2.polarity.value || 'Positive'
      return state.possibleAdducts[polarity].map(({ adduct, name, ...ad }) => ({ ...ad, value: adduct, label: name }))
    })
    // Top-level computed so templates, pages and specs read a plain string (nested refs inside `v2` do not unwrap)
    const v2Mode = computed(() => v2.mode.value)
    const v2Status = computed(() => v2.status.value)
    const v2FailedSlots = computed(() => v2.failedSlots.value)
    const datasetName = computed(() => state.metaspaceOptions.name || '')
    const descriptionText = computed(() => tiptapToPlainText(state.metaspaceOptions.description))
    // header counters of the Data management (2) and Annotation settings (5) cards
    const dataManagementFilled = computed(() => {
      const { submitterId, groupId, principalInvestigator } = state.metaspaceOptions
      const pi = principalInvestigator
      const piValid = pi != null && (pi.name || '').length >= 4 && emailRegex.test(pi.email || '')
      return (submitterId != null || state.submitter != null ? 1 : 0) + (groupId != null || piValid ? 1 : 0)
    })
    const annotationSettingsFilled = computed(() => {
      const { databaseIds, adducts, name, scoringModelId, ppm } = state.metaspaceOptions
      return [!isEmpty(databaseIds), !isEmpty(adducts), (name || '').length >= 5, scoringModelId != null, !!ppm].filter(
        Boolean
      ).length
    })
    const v2Complete = computed(() => v2.status.value.missingRequired.length === 0)
    const publicDisabled = computed(() => v2.mode.value === 'legacy' && v2.status.value.missingRequired.length > 0)
    const publicDisabledReason = computed(() => {
      if (!publicDisabled.value) {
        return ''
      }
      const n = v2.status.value.missingRequired.length
      return `Public requires the required v2 fields — ${n} still missing.`
    })

    const updateCurrentAdductOptions = () => {
      const selectedAdducts = state.metaspaceOptions.adducts || []
      let newAdducts = selectedAdducts.filter((adduct) => adductOptions.value.some((option) => option.value === adduct))
      // If no selected adducts are still valid, reset to the default adducts
      if (newAdducts.length === 0) {
        newAdducts = adductOptions.value.filter((option) => option.default).map((option) => option.value)
      }
      state.metaspaceOptions.adducts = newAdducts
    }

    watch(
      () => v2.polarity.value,
      () => {
        if (state.loaded) updateCurrentAdductOptions()
      }
    )
    watch(
      () => v2.resolvingPower.value?.Resolving_Power,
      (rp) => {
        // recommend ppm 10 below 70k resolving power and 3 above, on new uploads only
        if (isNew.value && rp != null) state.metaspaceOptions.ppm = rp < 70000 ? 10 : 3
      }
    )
    watch(
      () => props.validationErrors,
      (errs) => v2.setServerErrors(errs || []),
      { immediate: true }
    )

    const loadForm = async (dataset, options) => {
      const metaspaceOptions = defaults({}, omitBy(dataset.metaspaceOptions, isNil), defaultMetaspaceOptions)
      if (isNew.value) {
        await v2.loadNew(dataset.seed || {})
      } else {
        await v2.loadDataset(dataset.v2Source)
      }

      // Load options
      const { adducts, molecularDatabases, scoringModels, ontologyDbs } = options
      state.possibleAdducts = {
        Positive: adducts.filter((a) => a.charge > 0),
        Negative: adducts.filter((a) => a.charge < 0),
      }
      state.scoringModels = scoringModels
      state.defaultDb = molecularDatabases.find((db) => db.default) || {}
      state.molDBsByGroup = getDatabasesByGroup(molecularDatabases)
      state.ontologyDbs = nestEnrichmentDbs(
        config.features.metabo_enrich ? ontologyDbs : [ontologyDbs.find((eDb) => eDb.name === 'LION')]
      )
      const selectedDbs = dataset.databases || []
      const selectedOntologyDbs = dataset.ontologyDatabases || []

      if (!isNew.value && metaspaceOptions?.ontologyDbIds?.length === 0 && metaspaceOptions.performEnrichment) {
        metaspaceOptions.ontologyDbIds = [ontologyDbs.find((eDb) => eDb.name === 'LION').id]
      }

      // backward compatibility
      if (!metaspaceOptions.scoringModelId) {
        metaspaceOptions.scoringModelId = (scoringModels.find((m) => m.type === 'original') || {}).id
      } else {
        let currentModel =
          scoringModels.find((m) => m.id === metaspaceOptions.scoringModelId) ||
          // keep for backward compatibility to scoring model (v3_default)
          scoringModels.find((m) => m.name === metaspaceOptions.scoringModelId) ||
          {}
        if (isNew.value && currentModel.isArchived) {
          currentModel = scoringModels.find((m) => m.type === 'original') || {}
        }
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
        metaspaceOptions.ontologyDbIds = uniq(selectedOntologyDbs.map((db) => db.id))
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

      state.loaded = true
      state.metaspaceOptions = metaspaceOptions
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

    /* for outside access from the upload page, to autofill it with the filename */
    const fillDatasetName = (name) => {
      if (!state.metaspaceOptions.name || state.metaspaceOptions.name === state.autoDatasetName) {
        state.metaspaceOptions.name = state.autoDatasetName = name
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

      const tempGroup = state.metaspaceOptions.groupId
      state.metaspaceOptions.groupId = null
      setTimeout(() => {
        state.metaspaceOptions.groupId = tempGroup
      }, 500)
    }

    const resetMetaboliteDatabase = () => {
      state.metaspaceOptions.databaseIds = []
    }

    const getFormValueForSubmit = () => {
      validate()
      const status = v2.status.value
      // key + label: the edit page links each gap to its field (v2.requestFocus)
      const missingRequired = status.missingRequired.map((f) => ({ key: f.key, label: f.label }))
      if (missingRequired.length > 0) {
        v2.markSubmitAttempt()
      }
      if (v2.mode.value !== 'legacy' && missingRequired.length > 0) {
        ElMessage({
          message: `Please fill the required metadata fields: ${missingRequired.map((f) => f.label).join(', ')}`,
          type: 'warning',
        })
        return null
      }
      if (!isEmpty(state.localErrors)) {
        ElMessage({ message: 'Please check that you entered metadata correctly!', type: 'warning' })
        return null
      }
      const name = state.metaspaceOptions.name
      return {
        datasetId: props.datasetId ? props.datasetId : '',
        mode: v2.mode.value,
        metadataV2Json: v2.serialize(name),
        initialMetadataV2Json: v2.initialEnvelope.value
          ? JSON.stringify(setAtPath(v2.initialEnvelope.value, 'document.dataset_name', name || undefined))
          : null,
        metadataDirty: v2.isDirty.value,
        missingRequired,
        metaspaceOptions: state.metaspaceOptions,
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
        ontologyDbIds: isNew ? null : get(config, 'ontology_db_ids') || null,
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
            seed: { metadataV2Json: dataset?.metadataV2Json, metadataJson: dataset?.metadataJson },
            metaspaceOptions: {
              ...(dataset != null ? metaspaceOptionsFromDataset(dataset, true) : null),
              submitterId: store.state.currentTour ? null : data.currentUser.id,
              groupId: store.state.currentTour
                ? null
                : data.currentUser.primaryGroup && data.currentUser.primaryGroup.group.id,
            },
            submitter: data.currentUser,
            databases: dataset ? dataset.databases : [],
            ontologyDatabases: dataset?.ontologyDatabases || [],
          }
        } else {
          const result = await fetchDatasetData()
          const data = result.data
          if (data.dataset == null) {
            state.loadFailed = true
            return null
          }
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
            v2Source: {
              id: data.dataset.id,
              metadataV2Json: data.dataset.metadataV2Json,
              metadataJson: data.dataset.metadataJson,
              uploadDT: data.dataset.uploadDT,
              submitter: { name: submitter?.name || data.dataset.submitter?.name || null },
            },
            metaspaceOptions: metaspaceOptionsFromDataset(data.dataset, false),
            submitter,
            databases: data.dataset.databases,
          }
        }
      } catch (e) {
        if (props.datasetId) {
          state.loadFailed = true
          return null
        }
        return {
          seed: {},
          v2Source: { id: props.datasetId || '', metadataJson: '{}' },
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
          seed: { metadataV2Json: data.dataset?.metadataV2Json, metadataJson: data.dataset?.metadataJson },
          metaspaceOptions: {
            ...(data.dataset != null ? metaspaceOptionsFromDataset(data.dataset, false) : null),
            submitterId: store.state.currentTour ? null : data.currentUser.id,
            groupId: store.state.currentTour
              ? null
              : data.currentUser.primaryGroup && data.currentUser.primaryGroup.group.id,
          },
          submitter: data.currentUser,
          databases: data.dataset ? data.dataset.databases : [],
        }
        await loadForm(dataset, await loadOptions())
      } catch (e) {
        state.metadataTemplate = null
        reportError(e)
      }
    }
    const initializeForm = async () => {
      const [dataset, options] = await Promise.all([loadDataset(), loadOptions()])
      if (dataset == null) {
        return
      }
      await loadForm(dataset, options)
      if (isNew.value) {
        await fetchDatasets()
      }
    }

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
      adductOptions,
      v2,
      v2Mode,
      v2Status,
      v2FailedSlots,
      datasetName,
      descriptionText,
      dataManagementFilled,
      annotationSettingsFilled,
      loadFailed: computed(() => state.loadFailed),
      publicDisabled,
      publicDisabledReason,
      v2Complete,
      state,
      fetchDatasets,
      metadataTemplateSelection,
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
  max-width: 950px;
}

#load-indicator {
  min-height: 300px;
}

#description-container {
  @apply p-0 border rounded border-solid;
  min-width: 200px;
  border-color: #bccddc;
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
