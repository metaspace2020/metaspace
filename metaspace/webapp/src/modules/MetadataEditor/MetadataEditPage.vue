<template>
  <div class="page">
    <div class="content">
      <fade-transition>
        <div v-if="state.errorMessage" class="flex justify-center">
          <div class="text-danger leading-normal mb-6">
            <p class="font-bold m-0">
              {{ state.errorMessage }}
            </p>
            <p class="text-sm m-0">
              If this is a problem please contact us at
              <a class="text-inherit font-medium" target="_blank" rel="noopener" href="mailto:contact@metaspace2020.org"
                >contact@metaspace2020.org</a
              >.
            </p>
            <p class="mb-0 mt-2">
              <a href="#" class="text-inherit text-sm font-medium" @click.prevent="reload"> Refresh page </a>
            </p>
          </div>
        </div>
      </fade-transition>
      <div class="page-header">
        <div class="page-header__title">
          <h2 class="page-header__heading">
            Edit dataset<template v-if="editor && editor.datasetName"> — {{ editor.datasetName }}</template>
          </h2>
        </div>
        <el-button @click="handleCancel"> Cancel </el-button>
        <el-button
          type="primary"
          :disabled="!loggedIn || state.isSubmitting || (editor && editor.loadFailed)"
          :title="loggedIn ? undefined : 'You must be logged in to perform this operation'"
          @click="handleSubmit"
        >
          Submit
        </el-button>
      </div>
      <el-alert v-if="state.gapAlert" type="warning" :closable="true" class="mb-4" @close="state.gapAlert = null">
        <p class="m-0 font-medium">The metadata is not complete yet.</p>
        <ul class="my-1 pl-5">
          <li v-for="field in state.gapAlert.missingRequired" :key="field.key">
            <a href="#" class="gap-link" @click.prevent="focusGap(field.key)">{{ field.label }}</a> is required and
            empty
          </li>
          <li v-for="err in state.gapAlert.otherErrors" :key="err">{{ err }}</li>
        </ul>
      </el-alert>
      <metadata-editor ref="editor" :dataset-id="datasetId" :validation-errors="state.validationErrors" />
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, reactive, computed, inject, onMounted, watch } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { useQuery, DefaultApolloClient } from '@vue/apollo-composable'
import MetadataEditor from './MetadataEditor.vue'
import { mapServerErrors } from './v2/errorPaths'
import FadeTransition from '../../components/FadeTransition'
import { currentUserRoleQuery } from '../../api/user'
import { updateDatasetQuery } from '../../api/metadata'
import { getSystemHealthQuery, getSystemHealthSubscribeToMore } from '../../api/system'
import { getDatasetStatusQuery } from '../../api/dataset'
import { ElMessage, ElMessageBox, ElAlert } from '../../lib/element-plus'
import { isArray, isEqual, get } from 'lodash-es'
import config from '../../lib/config'

export default defineComponent({
  name: 'MetadataEditPage',
  components: {
    MetadataEditor,
    FadeTransition,
    ElAlert,
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    const apolloClient = inject(DefaultApolloClient)
    const editor = ref(null)
    const datasetId = computed(() => store.state.route.params.dataset_id)
    const state = reactive({
      errorMessage: null,
      validationErrors: [],
      isSubmitting: false,
      gapAlert: null,
    })
    const { result: currentUserResult } = useQuery(currentUserRoleQuery, null, {
      fetchPolicy: 'cache-first',
    })
    const currentUser = computed(() => currentUserResult.value?.currentUser)

    const { result: datasetStatusResult } = useQuery(getDatasetStatusQuery, () => ({ id: datasetId.value }), {
      fetchPolicy: 'cache-first',
    })
    const datasetStatus = computed(() => datasetStatusResult.value.dataset.status)

    const { result: systemHealthResult, subscribeToMore } = useQuery(getSystemHealthQuery, null, {
      fetchPolicy: 'cache-first',
    })
    const systemHealth = computed(() => systemHealthResult.value.systemHealth)

    const loggedIn = computed(() => currentUser.value != null && currentUser.value.id != null)

    onMounted(() => {
      subscribeToMore(getSystemHealthSubscribeToMore)
    })

    /** Scrolls to and focuses a v2 field; MetadataV2Section expands its card for the request. */
    const focusGap = (key) => {
      if (key) editor.value?.v2?.requestFocus(key)
    }

    // the gap alert describes the form at submit time: drop it once every listed gap is resolved
    watch(
      () => editor.value?.v2Complete,
      (complete) => {
        if (!complete || !state.gapAlert) return
        const { otherErrors } = state.gapAlert
        state.gapAlert = otherErrors.length > 0 ? { missingRequired: [], otherErrors } : null
      }
    )

    const handleCancel = () => {
      router.back()
    }

    const updateOrReprocess = async (datasetId, payload, options) => {
      return apolloClient.mutate({
        mutation: updateDatasetQuery,
        variables: {
          id: datasetId,
          input: payload,
          useLithops: config.features.lithops,
          performEnrichment: payload.performEnrichment,
          ...options,
        },
      })
    }

    const confirmReprocess = async () => {
      try {
        await ElMessageBox.confirm(
          'The changes to the analysis options require the dataset to be reprocessed. ' +
            'This dataset will be unavailable until reprocessing has completed. Do you wish to continue?',
          'Reprocessing required',
          {
            type: 'warning',
            confirmButtonText: 'Continue',
            cancelButtonText: 'Cancel',
          }
        )
        return true
      } catch (e) {
        // Ignore - user clicked cancel
        return false
      }
    }

    const confirmSkipValidation = async () => {
      try {
        await ElMessageBox.confirm('There were validation errors. Save anyway?', 'Validation errors', {
          type: 'warning',
          confirmButtonText: 'Continue',
          cancelButtonText: 'Cancel',
        })
        return true
      } catch (e) {
        // Ignore - user clicked cancel
        return false
      }
    }

    const confirmForce = async () => {
      try {
        await ElMessageBox.confirm('This dataset is queued or processing. Save anyway?', 'Dataset busy', {
          type: 'warning',
          confirmButtonText: 'Continue',
          cancelButtonText: 'Cancel',
        })
        return true
      } catch (e) {
        // Ignore - user clicked cancel
        return false
      }
    }

    const saveDataset = async (datasetId, payload, options = {}) => {
      // TODO Lachlan: This is similar to the logic in UploadPage.vue. Refactor this when these components are in JSX
      try {
        await updateOrReprocess(datasetId, payload, options)
        return true
      } catch (err) {
        let graphQLError = null
        try {
          graphQLError = JSON.parse(err.graphQLErrors[0].message)
        } catch (err2) {
          /* The case where err does not contain a graphQL error is handled below */
        }

        if (get(err, 'graphQLErrors[0].isHandled')) {
          return false
        } else if (graphQLError && graphQLError.type === 'reprocessing_needed') {
          if (systemHealth.value && (!systemHealth.value.canProcessDatasets || !systemHealth.value.canMutate)) {
            ElMessageBox.alert(
              `Changes to the analysis options require that this dataset be reprocessed; however,
             dataset processing has been temporarily suspended so that we can safely update the website.\n\n
             Please wait a few hours and try again.`,
              'Dataset processing suspended',
              { type: 'warning' }
            ).catch(() => {
              /* Ignore exception raised when alert is closed */
            })
            return false
          } else if (
            currentUser.value?.role !== 'admin' &&
            (datasetStatus.value === 'QUEUED' || datasetStatus.value === 'ANNOTATING')
          ) {
            ElMessageBox.alert(
              `Changes to the analysis options require that this dataset be reprocessed; however,
            this dataset is currently annotating or queued for annotation.
            Please wait until annotation has finished before submitting it for reprocessing.`,
              'Dataset busy',
              { type: 'warning' }
            ).catch(() => {
              /* Ignore exception raised when alert is closed */
            })
            return false
          } else if (await confirmReprocess()) {
            return saveDataset(datasetId, payload, { ...options, reprocess: true })
          }
        } else if (graphQLError && graphQLError.type === 'wrong_moldb_name') {
          editor.value.resetMetaboliteDatabase()
          ElMessage({
            message:
              'An unrecognized metabolite database was selected. This field has been cleared. ' +
              'Please select the databases again and resubmit the form.',
            type: 'error',
          })
        } else if (graphQLError && graphQLError.type === 'failed_validation') {
          state.validationErrors = graphQLError.validation_errors
          const otherErrors = mapServerErrors(graphQLError.validation_errors || []).otherErrors
          state.gapAlert = otherErrors.length > 0 ? { missingRequired: [], otherErrors } : null
          if (currentUser.value && currentUser.value.role === 'admin' && (await confirmSkipValidation())) {
            return saveDataset(datasetId, payload, { ...options, skipValidation: true })
          }
          ElMessage({
            message: 'Please fix the highlighted fields and submit again',
            type: 'error',
          })
        } else if (graphQLError && graphQLError.type === 'dataset_busy') {
          if (currentUser.value && currentUser.value.role === 'admin' && (await confirmForce())) {
            return saveDataset(datasetId, payload, { ...options, force: true })
          }
          ElMessage({
            message: 'This dataset is busy. Please wait until it has finished processing before making changes.',
            type: 'error',
          })
        } else if (graphQLError && graphQLError.type === 'under_review_or_published') {
          state.errorMessage = 'Your changes could not be saved because the dataset is under review or published.'
        } else {
          ElMessage({
            message:
              'There was an unexpected problem submitting the dataset. Please refresh the page and try again.' +
              'If this problem persists, please contact us at ' +
              '<a href="mailto:contact@metaspace2020.org">contact@metaspace2020.org</a>',
            dangerouslyUseHTMLString: true,
            type: 'error',
            duration: 0,
            showClose: true,
          })
          throw err
        }
        return false
      }
    }
    const handleSubmit = async () => {
      const formValue = editor.value.getFormValueForSubmit()

      if (formValue != null) {
        const {
          datasetId,
          mode,
          metadataV2Json,
          initialMetadataV2Json,
          missingRequired,
          metaspaceOptions,
          initialMetaspaceOptions,
        } = formValue
        // Prevent duplicate submissions if user double-clicks
        if (state.isSubmitting) return
        const payload = {}
        const options = {}
        // A legacy (v1) dataset is migrated on every save: submitting it requires a complete v2 record, even
        // when only other settings changed. A v2 dataset sends metadata only when it changed.
        const sendMetadata = mode === 'legacy' || metadataV2Json !== initialMetadataV2Json
        if (sendMetadata && missingRequired.length > 0) {
          state.gapAlert = { missingRequired, otherErrors: [] }
          // take the user to the first gap (this also expands a collapsed Metadata card)
          focusGap(missingRequired[0].key)
          return
        }
        // For arrays (molDBs, adducts, projectIds) ignore changes in order
        const changedOptions = Object.keys(metaspaceOptions).filter((key) => {
          const oldVal = initialMetaspaceOptions[key]
          const newVal = metaspaceOptions[key]
          return isArray(oldVal) && isArray(newVal)
            ? !isEqual(oldVal.slice().sort(), newVal.slice().sort())
            : !isEqual(oldVal, newVal)
        })
        // an untouched v2 dataset: nothing to send, behave like Cancel
        if (!sendMetadata && changedOptions.length === 0) {
          handleCancel()
          return
        }
        state.gapAlert = null
        state.isSubmitting = true
        if (sendMetadata) {
          payload.metadataV2Json = metadataV2Json
        }

        // Include performEnrichment
        if (metaspaceOptions.performEnrichment) {
          payload.performEnrichment = metaspaceOptions.performEnrichment
        }

        changedOptions.forEach((key) => {
          payload[key] = metaspaceOptions[key]
        })

        try {
          const wasSaved = await saveDataset(datasetId, payload, options)

          if (wasSaved) {
            state.validationErrors = []
            ElMessage({
              message: 'Metadata was successfully updated!',
              type: 'success',
            })
            router.back()
          }
          // eslint-disable-next-line no-useless-catch
        } catch (e) {
          // Empty catch block needed because babel-plugin-component throws a
          // compilation error when an async function has a try/finally without a catch.
          // https://github.com/ElementUI/babel-plugin-component/issues/9
          throw e
        } finally {
          state.isSubmitting = false
        }
      }
    }

    const reload = () => {
      window.location.reload()
    }

    return {
      datasetId,
      currentUser,
      datasetStatus,
      systemHealth,
      state,
      editor,
      focusGap,
      handleCancel,
      handleSubmit,
      saveDataset,
      loggedIn,
      reload,
    }
  },
})
</script>

<style scoped lang="scss">
.page {
  display: flex;
  justify-content: center;
  margin-top: 25px;
}
.content {
  width: 950px;
  max-width: calc(100% - 32px);
}
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  > button {
    min-width: 80px;
    margin-left: 0;
  }
}
.page-header__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: auto;
  min-width: 0;
}
.gap-link {
  color: inherit;
  font-weight: 500;
  text-decoration: underline;
}
.page-header__heading {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: #102a42;
  overflow-wrap: anywhere;
}
@media (max-width: 767px) {
  .page-header {
    flex-wrap: wrap;
  }
}
</style>
