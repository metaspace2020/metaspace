<template>
  <div class="page">
    <div class="content">
      <fade-transition>
        <div
          v-if="errorMessage"
          class="flex justify-center"
        >
          <div class="text-danger leading-normal mb-6">
            <p class="font-bold m-0">
              {{ errorMessage }}
            </p>
            <p class="text-sm m-0">
              If this is a problem please contact us at <a
                class="text-inherit font-medium"
                target="_blank"
                rel="noopener"
                href="mailto:contact@metaspace2020.eu"
              >contact@metaspace2020.eu</a>.
            </p>
            <p class="mb-0 mt-2">
              <a
                href="#"
                class="text-inherit text-sm font-medium"
                @click.prevent="reload"
              >
                Refresh page
              </a>
            </p>
          </div>
        </div>
      </fade-transition>
      <div class="button-bar">
        <el-button @click="handleCancel">
          Cancel
        </el-button>
        <el-button
          type="primary"
          :disabled="!loggedIn || isSubmitting"
          :title="loggedIn ? undefined : 'You must be logged in to perform this operation'"
          @click="handleSubmit"
        >
          Submit
        </el-button>
      </div>
      <metadata-editor
        ref="editor"
        :dataset-id="datasetId"
        :validation-errors="validationErrors"
      />
    </div>
  </div>
</template>

<script>
import MetadataEditor from './MetadataEditor.vue'
import FadeTransition from '../../components/FadeTransition'
import { updateDatasetQuery } from '../../api/metadata'
import { getSystemHealthQuery, getSystemHealthSubscribeToMore } from '../../api/system'
import { isArray, isEqual, get } from 'lodash-es'
import { currentUserRoleQuery } from '../../api/user'
import config from '../../lib/config'
import { getDatasetStatusQuery } from '@/api/dataset'

export default {
  name: 'MetadataEditPage',
  components: {
    MetadataEditor,
    FadeTransition,
  },
  data() {
    return {
      errorMessage: null,
      validationErrors: [],
      isSubmitting: false,
      systemHealth: null,
      currentUser: null,
      datasetStatus: null,
    }
  },
  apollo: {
    systemHealth: {
      query: getSystemHealthQuery,
      subscribeToMore: getSystemHealthSubscribeToMore,
      fetchPolicy: 'cache-first',
    },
    currentUser: {
      query: currentUserRoleQuery,
      fetchPolicy: 'cache-first',
    },
    datasetStatus: {
      query: getDatasetStatusQuery,
      fetchPolicy: 'cache-first',
      variables() {
        return { id: this.datasetId }
      },
      update(data) {
        return data.dataset.status
      },
    },
  },
  computed: {
    datasetId() {
      return this.$store.state.route.params.dataset_id
    },

    loggedIn() {
      return this.currentUser != null && this.currentUser.id != null
    },
  },

  methods: {
    handleCancel() {
      this.$router.back()
    },
    async handleSubmit() {
      const formValue = this.$refs.editor.getFormValueForSubmit()

      if (formValue != null) {
        const { datasetId, metadataJson, metaspaceOptions, initialMetadataJson, initialMetaspaceOptions } = formValue
        // Prevent duplicate submissions if user double-clicks
        if (this.isSubmitting) return
        this.isSubmitting = true

        const payload = {}
        const options = {}
        // Only include changed fields in payload
        if (metadataJson !== initialMetadataJson) {
          payload.metadataJson = metadataJson
        }

        // Include performEnrichment
        if (metaspaceOptions.performEnrichment) {
          payload.performEnrichment = metaspaceOptions.performEnrichment
        }

        Object.keys(metaspaceOptions).forEach(key => {
          const oldVal = initialMetaspaceOptions[key]
          const newVal = metaspaceOptions[key]
          // For arrays (molDBs, adducts, projectIds) ignore changes in order
          if (isArray(oldVal) && isArray(newVal)
            ? !isEqual(oldVal.slice().sort(), newVal.slice().sort())
            : !isEqual(oldVal, newVal)) {
            payload[key] = newVal
          }
        })

        try {
          const wasSaved = await this.saveDataset(datasetId, payload, options)

          if (wasSaved) {
            this.validationErrors = []
            this.$message({
              message: 'Metadata was successfully updated!',
              type: 'success',
            })
            this.$router.back()
          }
          // eslint-disable-next-line no-useless-catch
        } catch (e) {
          // Empty catch block needed because babel-plugin-component throws a
          // compilation error when an async function has a try/finally without a catch.
          // https://github.com/ElementUI/babel-plugin-component/issues/9
          throw e
        } finally {
          this.isSubmitting = false
        }
      }
    },
    async saveDataset(datasetId, payload, options = {}) {
      // TODO Lachlan: This is similar to the logic in UploadPage.vue. Refactor this when these components are in JSX
      try {
        await this.updateOrReprocess(datasetId, payload, options)
        return true
      } catch (err) {
        let graphQLError = null
        try {
          graphQLError = JSON.parse(err.graphQLErrors[0].message)
        } catch (err2) { /* The case where err does not contain a graphQL error is handled below */ }

        if (get(err, 'graphQLErrors[0].isHandled')) {
          return false
        } else if (graphQLError && (graphQLError.type === 'reprocessing_needed')) {
          if (this.systemHealth && (!this.systemHealth.canProcessDatasets || !this.systemHealth.canMutate)) {
            this.$alert(`Changes to the analysis options require that this dataset be reprocessed; however,
             dataset processing has been temporarily suspended so that we can safely update the website.\n\n
             Please wait a few hours and try again.`,
            'Dataset processing suspended',
            { type: 'warning' })
              .catch(() => { /* Ignore exception raised when alert is closed */ })
            return false
          } else if (this.currentUser?.role !== 'admin'
            && (this.datasetStatus === 'QUEUED' || this.datasetStatus === 'ANNOTATING')) {
            this.$alert(`Changes to the analysis options require that this dataset be reprocessed; however,
            this dataset is currently annotating or queued for annotation.
            Please wait until annotation has finished before submitting it for reprocessing.`,
            'Dataset busy',
            { type: 'warning' })
              .catch(() => { /* Ignore exception raised when alert is closed */ })
            return false
          } else if (await this.confirmReprocess()) {
            return this.saveDataset(datasetId, payload, { ...options, reprocess: true })
          }
        } else if (graphQLError && graphQLError.type === 'wrong_moldb_name') {
          this.$refs.editor.resetMetaboliteDatabase()
          this.$message({
            message: 'An unrecognized metabolite database was selected. This field has been cleared. '
               + 'Please select the databases again and resubmit the form.',
            type: 'error',
          })
        } else if (graphQLError && graphQLError.type === 'failed_validation') {
          this.validationErrors = graphQLError.validation_errors
          if (this.currentUser && this.currentUser.role === 'admin' && await this.confirmSkipValidation()) {
            return this.saveDataset(datasetId, payload, { ...options, skipValidation: true })
          }
          this.$message({
            message: 'Please fix the highlighted fields and submit again',
            type: 'error',
          })
        } else if (graphQLError && graphQLError.type === 'dataset_busy') {
          if (this.currentUser && this.currentUser.role === 'admin' && await this.confirmForce()) {
            return this.saveDataset(datasetId, payload, { ...options, force: true })
          }
          this.$message({
            message: 'This dataset is busy. Please wait until it has finished processing before making changes.',
            type: 'error',
          })
        } else if (graphQLError && graphQLError.type === 'under_review_or_published') {
          this.errorMessage =
            'Your changes could not be saved because the dataset is under review or published.'
        } else {
          this.$message({
            message: 'There was an unexpected problem submitting the dataset. Please refresh the page and try again.'
               + 'If this problem persists, please contact us at '
               + '<a href="mailto:contact@metaspace2020.eu">contact@metaspace2020.eu</a>',
            dangerouslyUseHTMLString: true,
            type: 'error',
            duration: 0,
            showClose: true,
          })
          throw err
        }
        return false
      }
    },

    async confirmReprocess() {
      try {
        await this.$confirm('The changes to the analysis options require the dataset to be reprocessed. '
           + 'This dataset will be unavailable until reprocessing has completed. Do you wish to continue?',
        'Reprocessing required',
        {
          type: 'warning',
          confirmButtonText: 'Continue',
          cancelButtonText: 'Cancel',
        })
        return true
      } catch (e) {
        // Ignore - user clicked cancel
        return false
      }
    },

    async confirmSkipValidation() {
      try {
        await this.$confirm('There were validation errors. Save anyway?',
          'Validation errors',
          {
            type: 'warning',
            confirmButtonText: 'Continue',
            cancelButtonText: 'Cancel',
          })
        return true
      } catch (e) {
        // Ignore - user clicked cancel
        return false
      }
    },

    async confirmForce() {
      try {
        await this.$confirm('This dataset is queued or processing. Save anyway?',
          'Dataset busy',
          {
            type: 'warning',
            confirmButtonText: 'Continue',
            cancelButtonText: 'Cancel',
          })
        return true
      } catch (e) {
        // Ignore - user clicked cancel
        return false
      }
    },

    async updateOrReprocess(datasetId, payload, options) {
      return this.$apollo.mutate({
        mutation: updateDatasetQuery,
        variables: {
          id: datasetId,
          input: payload,
          useLithops: config.features.lithops,
          performEnrichment: payload.performEnrichment,
          ...options,
        },
      })
    },

    reload() {
      window.location.reload()
    },
  },
}
</script>
<style scoped lang="scss">
  .page {
    display: flex;
    justify-content: center;
    margin-top: 25px;
  }
  .content {
    width: 950px;
  }
  .button-bar {
    display: flex;
    justify-content: flex-end;
    > button {
      width: 100px;
      padding: 6px;
    }
  }
</style>
