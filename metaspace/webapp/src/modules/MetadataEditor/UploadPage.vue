<template>
  <div class="md-editor">
    <help-dialog
      :visible="helpDialog"
      @close="helpDialog = false"
    />
    <requested-access-dialog
      :visible="showRequestedDialog"
      :ds-submission="true"
      :group="group"
      @close="showRequestedDialog = false"
    />
    <div class="upload-page-wrapper">
      <div
        v-if="!enableUploads"
        id="maintenance-message"
        class="text-danger border-2 border-dashed border-danger mt-6 p-4 text-2xl text-center font-medium"
      >
        <p class="max-w-measure-3 my-0 mx-auto leading-snug">
          Dataset uploads have been temporarily disabled. Please try again later. Thank you for understanding!
        </p>
      </div>
      <div v-else-if="isSignedIn || isTourRunning">
        <div class="metadata-section">
          <div class="el-row">
            <div class="el-col el-col-6">
              &nbsp;
            </div>
            <div class="el-col el-col-18">
              <div class="flex justify-between items-center form-margin h-10">
                <el-button
                  class="text-gray-600 mr-auto"
                  @click="helpDialog = true"
                >
                  Need help?
                </el-button>
                <fade-transition>
                  <p
                    v-if="autoSubmit"
                    class="text-gray-700 m-0 mr-3 text-right text-sm leading-5"
                  >
                    submitting after upload &ndash;
                    <button
                      class="button-reset font-medium text-primary"
                      title="Cancel automatic submit"
                      @click="autoSubmit = false"
                    >
                      cancel
                    </button>
                  </p>
                </fade-transition>
                <el-button
                  type="primary"
                  :disabled="submitDisabled"
                  :loading="autoSubmit"
                  @click="onSubmit"
                >
                  Submit
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <div class="metadata-section">
          <form
            class="el-form el-form--label-top el-row"
            @submit.prevent
          >
            <div class="el-col el-col-6">
              <div class="metadata-section__title">
                Imaging MS data
              </div>
            </div>
            <div
              v-loading="status === 'LOADING'"
              class="el-col el-col-18"
            >
              <div class="md-form-field">
                <uppy-uploader
                  :key="storageKey.uuid"
                  :disabled="status === 'SUBMITTING'"
                  :required-file-types="['imzML', 'ibd']"
                  :s3-options="s3Options"
                  :options="uppyOptions"
                  :current-user="currentUser"
                  @file-added="onFileAdded"
                  @file-removed="onFileRemoved"
                  @upload="onUploadStart"
                  @complete="onUploadComplete"
                />
              </div>
            </div>
          </form>
        </div>
        <metadata-editor
          ref="editor"
          :validation-errors="validationErrors"
        />
      </div>
    </div>
  </div>
</template>

<script>
import Vue from 'vue'
import { Message } from 'element-ui/'

import UppyUploader from '../../components/UppyUploader/UppyUploader.vue'
import FadeTransition from '../../components/FadeTransition'
import MetadataEditor from './MetadataEditor.vue'
import HelpDialog from './HelpDialog.vue'

import { createDatasetQuery } from '../../api/dataset'
import { getSystemHealthQuery, getSystemHealthSubscribeToMore } from '../../api/system'
import get from 'lodash-es/get'
import { currentUserIdQuery } from '../../api/user'
import reportError from '../../lib/reportError'
import { parseS3Url } from '../../lib/util'
import config from '../../lib/config'
import gql from 'graphql-tag'
import { ViewGroupFragment } from '@/api/group'
import { RequestedAccessDialog } from '../Group/RequestedAccessDialog'

const createInputPath = (url, uuid) => {
  const parsedUrl = new URL(url)
  const { bucket } = parseS3Url(parsedUrl)
  return `s3a://${bucket}/${uuid}`
}

const basename = fname => fname.split('.').slice(0, -1).join('.')
const groupRoleQuery = gql`query GroupProfileById($groupIdOrSlug: ID!) {
              group(groupId: $groupIdOrSlug) { ...ViewGroupFragment hasPendingRequest }
            }
            ${ViewGroupFragment}`
const uppyOptions = {
  debug: true,
  autoProceed: true,
  restrictions: {
    maxNumberOfFiles: 2,
    minNumberOfFiles: 2, // add both files before uploading
    allowedFileTypes: ['.imzML', '.ibd'],
  },
  meta: {},
  onBeforeFileAdded: (newFile, fileLookup = {}) => {
    const currentFiles = Object.values(fileLookup)
    if (currentFiles.length === 0) return true
    if (currentFiles.length === 2) return false

    const [existingFile] = currentFiles

    if (newFile.extension === existingFile.extension) return false

    const existingName = basename(existingFile.name)
    const newName = basename(newFile.name)

    if (existingName !== newName) {
      Message({
        message: 'Please make sure the files have the same name before the extension',
        type: 'error',
      })
      return false
    }
  },
}

export default {
  name: 'UploadPage',
  apollo: {
    systemHealth: {
      query: getSystemHealthQuery,
      subscribeToMore: getSystemHealthSubscribeToMore,
      fetchPolicy: 'cache-first',
    },
    currentUser: {
      query: currentUserIdQuery,
      fetchPolicy: 'cache-first',
      result({ data }) {
        if (data.currentUser == null && this.$store.state.currentTour == null) {
          this.$store.commit('account/showDialog', {
            dialog: 'signIn',
            dialogCloseRedirect: '/',
            loginSuccessRedirect: '/upload',
          })
        }
      },
    },
  },
  components: {
    UppyUploader,
    MetadataEditor,
    HelpDialog,
    FadeTransition,
    RequestedAccessDialog,
  },
  data() {
    return {
      status: 'INIT',
      showRequestedDialog: false,
      validationErrors: [],
      storageKey: {
        uuid: null,
        uuidSignature: null,
      },
      uploads: {
        imzml: false,
        ibd: false,
      },
      autoSubmit: false,
      helpDialog: false,
      group: null,
      systemHealth: null,
      currentUser: null,
      inputPath: null,
    }
  },

  computed: {

    uuid() {
      return this.storageKey.uuid
    },

    submitDisabled() {
      return this.isTourRunning || ['INIT', 'LOADING', 'SUBMITTING'].includes(this.status)
    },

    isTourRunning() {
      return this.$store.state.currentTour != null
    },

    isSignedIn() {
      return this.currentUser != null && this.currentUser.id != null
    },

    enableUploads() {
      return !this.systemHealth || (this.systemHealth.canMutate && this.systemHealth.canProcessDatasets)
    },

    uploadEndpoint() {
      return `${window.location.origin}/dataset_upload`
    },

    s3Options() {
      return {
        companionUrl: this.uploadEndpoint,
        companionHeaders: this.storageKey,
      }
    },

    uppyOptions() {
      return uppyOptions
    },
  },

  watch: {
    status(status) {
      if (status === 'UPLOADED' && this.autoSubmit) {
        this.autoSubmit = false
        this.submitForm()
      }
    },
  },

  created() {
    this.$store.commit('updateFilter', this.$store.getters.filter)
    this.fetchStorageKey()
  },

  methods: {
    async fetchStorageKey() {
      this.status = 'LOADING'
      try {
        const response = await fetch(`${this.uploadEndpoint}/s3/uuid`)
        if (response.status < 200 || response.status >= 300) {
          const responseBody = await response.text()
          reportError(new Error(`Unexpected server response getting upload UUID: ${response.status} ${responseBody}`))
        } else {
          // uuid and uuidSignature
          this.storageKey = await response.json()
        }
      } catch (e) {
        reportError(e)
      } finally {
        this.status = 'READY'
      }
    },

    onFileAdded(file) {
      const { name } = file
      const dsName = name.slice(0, name.lastIndexOf('.'))
      Vue.nextTick(() => {
        this.$refs.editor.fillDatasetName(dsName)
      })
    },

    async onFileRemoved(file) {
      this.uploads[file.extension.toLowerCase()] = false
      if (Object.values(this.uploads).every(flag => !flag)) {
        // Get a new storage key, because the old uploads may have different filenames which would cause later issues
        // when trying to determine which file to use if they were uploaded to the same prefix.
        await this.fetchStorageKey()
      } else {
        this.status = 'READY'
      }
    },

    onUploadStart() {
      this.status = 'UPLOADING'
    },

    onUploadComplete(result) {
      for (const file of result.failed) {
        this.uploads[file.extension.toLowerCase()] = false
      }
      for (const file of result.successful) {
        this.uploads[file.extension.toLowerCase()] = true
      }

      if (this.uploads.imzml === true && this.uploads.ibd === true) {
        const [file] = result.successful
        const { uploadURL } = file

        this.inputPath = createInputPath(uploadURL, this.uuid)
        this.status = 'UPLOADED'
      } else {
        if (result.failed.length) {
          reportError()
        }
        this.status = 'READY'
      }
    },

    onSubmit() {
      // Prevent duplicate submissions if user double-clicks
      if (this.status === 'SUBMITTING') return

      if (this.status !== 'UPLOADED') {
        this.autoSubmit = true
      } else {
        this.submitForm()
      }
    },

    async submitForm() {
      const formValue = this.$refs.editor.getFormValueForSubmit()
      if (formValue === null) return

      this.status = 'SUBMITTING'
      const { metadataJson, metaspaceOptions } = formValue
      const performEnrichment = metaspaceOptions.performEnrichment
      delete metaspaceOptions.performEnrichment
      try {
        await this.$apollo.mutate({
          mutation: createDatasetQuery,
          variables: {
            input: {
              inputPath: this.inputPath,
              metadataJson,
              ...metaspaceOptions,
            },
            useLithops: config.features.lithops,
            performEnrichment,
          },
        })

        this.inputPath = null
        this.validationErrors = []
        this.fetchStorageKey()
        this.$refs.editor.resetAfterSubmit()
        this.$message({
          message: 'Your dataset was successfully submitted!',
          type: 'success',
        })
      } catch (err) {
        let graphQLError = null
        try {
          graphQLError = JSON.parse(err.graphQLErrors[0].message)
        } catch (err2) { /* The case where err does not contain a graphQL error is handled below */ }

        if (get(err, 'graphQLErrors[0].isHandled')) {
          return false
        } else if (graphQLError && graphQLError.type === 'failed_validation') {
          this.validationErrors = graphQLError.validation_errors
          this.$message({
            message: 'Please fix the highlighted fields and submit again',
            type: 'error',
          })
        } else if (graphQLError && graphQLError.type === 'wrong_moldb_name') {
          this.$refs.editor.resetMetaboliteDatabase()
          this.$message({
            message: 'An unrecognized metabolite database was selected. This field has been cleared, '
             + 'please select the databases again and resubmit the form.',
            type: 'error',
          })
        } else {
          this.$message({
            message: 'There was an unexpected problem submitting the dataset. Please refresh the page and try again. '
               + 'If this problem persists, please contact us at '
               + '<a href="mailto:contact@metaspace2020.eu">contact@metaspace2020.eu</a>',
            dangerouslyUseHTMLString: true,
            type: 'error',
            duration: 0,
            showClose: true,
          })
          throw err
        }
      } finally {
        if (this.status === 'SUBMITTING') { // i.e. if unsuccessful
          this.status = 'UPLOADED'
        }

        // check if group approval is pending
        if (metaspaceOptions.groupId) {
          const resp = await this.$apollo.query({
            query: groupRoleQuery,
            variables: { groupIdOrSlug: metaspaceOptions.groupId },
          })
          this.group = resp.data.group
          this.showRequestedDialog = resp.data?.group?.currentUserRole === 'PENDING'
        }
      }
    },

    cancel() {
      this.$router.go(-1)
    },
  },
}

</script>

<style scoped>
  #filter-panel-container > * {
    padding-left: 0;
  }

  #sign-in-intro {
    padding: 20px;
  }

  .sign-in-message {
    margin: 1.5em 0;
    font-size: 1.5em;
  }

  .upload-page-wrapper {
    width: 950px;
  }

  .md-editor {
    padding: 0 20px 20px 20px;
    display: flex;
    justify-content: center;
  }

  .md-editor-submit {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
  }

  .md-editor-submit > button {
    flex: 1 auto;
    margin: 25px 5px;
  }

  .form-margin {
    margin: 0 5px;
  }
</style>
