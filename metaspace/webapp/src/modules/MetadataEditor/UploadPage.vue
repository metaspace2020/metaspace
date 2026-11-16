<template>
  <div class="md-editor">
    <help-dialog :visible="state.helpDialog" @close="state.helpDialog = false" />
    <requested-access-dialog
      :visible="state.showRequestedDialog"
      :ds-submission="true"
      :group="state.group"
      @close="state.showRequestedDialog = false"
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
        <div class="page-header">
          <h2 class="page-header__heading">Upload dataset</h2>
          <el-button @click="state.helpDialog = true"> Need help? </el-button>
          <fade-transition>
            <p v-if="state.autoSubmit" class="text-gray-700 m-0 text-right text-sm leading-5">
              submitting after upload &ndash;
              <button
                class="button-reset font-medium text-primary"
                title="Cancel automatic submit"
                @click="state.autoSubmit = false"
              >
                cancel
              </button>
            </p>
          </fade-transition>
          <el-button type="primary" :disabled="submitDisabled" :loading="state.autoSubmit" @click="onSubmit">
            Submit
          </el-button>
        </div>
        <form class="upload-data-row" @submit.prevent>
          <section-card class="md-imaging-data" title="Imaging MS data" subtitle=".imzML and .ibd pair">
            <template #headerRight>
              <span class="md-files-counter">{{ presentCount }} of 2 files</span>
              <el-progress
                class="md-files-progress"
                :percentage="presentCount * 50"
                :status="uploadedCount === 2 ? 'success' : undefined"
                :stroke-width="6"
                :show-text="false"
                :aria-label="`${presentCount} of 2 files selected, ${uploadedCount} uploaded`"
              />
            </template>
            <div v-loading="state.status === 'LOADING'">
              <uppy-uploader
                :key="state.uploaderKey"
                variant="slots"
                :disabled="state.status === 'SUBMITTING'"
                :required-file-types="['imzML', 'ibd']"
                :s3-options="s3Options"
                :options="uppyOptions"
                :current-user="currentUser"
                @file-added="onFileAdded"
                @file-removed="onFileRemoved"
                @files-changed="onFilesChanged"
                @upload="onUploadStart"
                @complete="onUploadComplete"
              />
            </div>
          </section-card>
        </form>
        <el-alert v-if="state.otherErrors.length" type="warning" :closable="false" class="mb-4">
          <ul class="my-1 pl-5">
            <li v-for="err in state.otherErrors" :key="err">{{ err }}</li>
          </ul>
        </el-alert>
        <metadata-editor ref="editor" :validation-errors="state.validationErrors" :current-user="currentUser" />
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, reactive, computed, watch, nextTick, inject, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { useQuery, DefaultApolloClient } from '@vue/apollo-composable'
import { ElMessage, ElAlert, ElProgress } from '../../lib/element-plus'
import { mapServerErrors } from './v2/errorPaths'
import UppyUploader from '../../components/UppyUploader/UppyUploader.vue'
import FadeTransition from '../../components/FadeTransition'
import MetadataEditor from './MetadataEditor.vue'
import { SectionCard } from './v2/components/SectionCard'
import HelpDialog from './HelpDialog.vue'
import { RequestedAccessDialog } from '../Group/RequestedAccessDialog'
import reportError from '../../lib/reportError'
import { parseS3Url } from '../../lib/util'
import config from '../../lib/config'
import gql from 'graphql-tag'
import { createDatasetQuery } from '../../api/dataset'
import { currentUserIdQuery } from '../../api/user'
import { ViewGroupFragment } from '../../api/group'
import { getSystemHealthQuery, getSystemHealthSubscribeToMore } from '../../api/system'
import { get } from 'lodash-es'
import { ElMessageBox } from '../../lib/element-plus'
// import { onBeforeUnmount } from 'vue'

const createInputPath = (url, uuid) => {
  const parsedUrl = new URL(url)
  const { bucket } = parseS3Url(parsedUrl)
  return `s3a://${bucket}/${uuid}`
}

const basename = (fname) => fname.split('.').slice(0, -1).join('.')
const groupRoleQuery = gql`
  query GroupProfileById($groupIdOrSlug: ID!) {
    group(groupId: $groupIdOrSlug) {
      ...ViewGroupFragment
      hasPendingRequest
    }
  }
  ${ViewGroupFragment}
`

export default defineComponent({
  name: 'UploadPage',
  components: {
    UppyUploader,
    ElAlert,
    ElProgress,
    MetadataEditor,
    SectionCard,
    HelpDialog,
    FadeTransition,
    RequestedAccessDialog,
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    const apolloClient = inject(DefaultApolloClient)
    const editor = ref(null)
    const state = reactive({
      status: 'INIT',
      showRequestedDialog: false,
      validationErrors: [],
      otherErrors: [],
      storageKey: {
        uuid: null,
        uuidSignature: null,
      },
      uploads: {
        imzml: false,
        ibd: false,
      },
      fileSize: {
        imzml: false,
        ibd: false,
      },
      autoSubmit: false,
      helpDialog: false,
      // remounts the uploader; bumped with each new storage key except during a Replace (picker is open)
      uploaderKey: 0,
      // per required type status from the uploader ({ extension, status }[]) for the header counter
      slotStatuses: [],
      group: null,
      inputPath: null,
    })

    // onBeforeUnmount(() => {
    //   store.commit('setThemeVariant', 'default')
    // })

    const { result: currentUserResult, onResult } = useQuery(currentUserIdQuery, null, {
      fetchPolicy: 'network-only',
    })
    const currentUser = computed(() => currentUserResult.value?.currentUser)

    onResult((result) => {
      const { data } = result
      if (data && data.currentUser == null && store.state.currentTour == null) {
        store.commit('account/showDialog', {
          dialog: 'signIn',
          dialogCloseRedirect: '/',
          loginSuccessRedirect: '/upload',
        })
      }
    })

    const { result: systemHealthResult, subscribeToMore } = useQuery(getSystemHealthQuery, null, {
      fetchPolicy: 'cache-first',
    })
    const systemHealth = computed(() => systemHealthResult.value?.systemHealth)
    const uuid = computed(() => state.storageKey.uuid)
    // "N of 2 files" in the Imaging MS data header: required files present (picked, uploading or uploaded)
    const presentCount = computed(
      () => state.slotStatuses.filter((f) => ['PENDING', 'UPLOADING', 'COMPLETE'].includes(f.status)).length
    )
    const uploadedCount = computed(() => state.slotStatuses.filter((f) => f.status === 'COMPLETE').length)
    const onFilesChanged = (statuses) => {
      state.slotStatuses = statuses
    }
    const isTourRunning = computed(() => store.state.currentTour != null)
    const submitDisabled = computed(() => {
      return isTourRunning.value || ['INIT', 'LOADING', 'SUBMITTING'].includes(state.status)
    })
    const isSignedIn = computed(() => currentUser.value != null && currentUser.value.id != null)
    const enableUploads = computed(() => {
      return !systemHealth.value || (systemHealth.value.canMutate && systemHealth.value.canProcessDatasets)
    })
    const uploadEndpoint = computed(() => {
      return `${window.location.origin}/dataset_upload`
    })
    const s3Options = computed(() => {
      return {
        companionUrl: uploadEndpoint.value,
        companionHeaders: state.storageKey,
      }
    })

    const uppyOptions = computed(() => {
      return {
        debug: true,
        // UppyUploader starts the upload itself once both files are present; autoProceed would try after the
        // first file and log a RestrictionError
        autoProceed: false,
        restrictions: {
          maxNumberOfFiles: 2,
          minNumberOfFiles: 2, // add both files before uploading
          allowedFileTypes: ['.imzML', '.ibd'],
        },
        meta: {},
        onBeforeFileAdded: (newFile, fileLookup = {}) => {
          // Check if the .ibd file is larger than 20GB
          if (!config.features.ignore_ibd_size && newFile.name.endsWith('.ibd')) {
            const GB = 1024 ** 3 // 1GB in bytes
            const maxSize = 20
            if (newFile.data.size > maxSize * GB) {
              ElMessageBox.alert(
                `Files with .ibd extension must be smaller than ${maxSize}GB.
<a target="_blank" href="mailto:contact@metaspace2020.org">Contact us</a> if you need to upload larger files.`,
                'File too large',
                {
                  dangerouslyUseHTMLString: true,
                  showConfirmButton: false,
                }
              ).catch(() => {
                /* Ignore exception raised when alert is closed */
              })
              return false // Prevent the file from being added
            }
          }

          if (newFile.data.size <= 0) {
            ElMessageBox.alert(`Files with .ibd extension must be greater than 0.`, 'File too small', {
              dangerouslyUseHTMLString: true,
              showConfirmButton: false,
            }).catch(() => {
              /* Ignore exception raised when alert is closed */
            })
            return false // Prevent the file from being added
          }

          const currentFiles = Object.values(fileLookup)
          if (currentFiles.length === 0) return true
          if (currentFiles.length === 2) return false

          const [existingFile] = currentFiles

          if (newFile.extension === existingFile.extension) return false

          const existingName = basename(existingFile.name)
          const newName = basename(newFile.name)

          if (existingName !== newName) {
            ElMessage({
              message: 'Please make sure the files have the same name before the extension',
              type: 'error',
            })
            return false
          }
        },
      }
    })

    const cancel = () => {
      router.go(-1)
    }

    const fetchStorageKey = async ({ keepUploader = false } = {}) => {
      state.status = 'LOADING'
      try {
        const response = await fetch(`${uploadEndpoint.value}/s3/uuid`, { cache: 'no-cache' })
        if (response.status < 200 || response.status >= 300) {
          const responseBody = await response.text()
          reportError(new Error(`Unexpected server response getting upload UUID: ${response.status} ${responseBody}`))
        } else {
          // uuid and uuidSignature
          state.storageKey = await response.json()
          // a Replace keeps the mounted uploader (its picker is open); the new key reaches it via s3Options
          if (!keepUploader) state.uploaderKey++
        }
      } catch (e) {
        reportError(e)
      } finally {
        state.status = 'READY'
      }
    }

    const onFileAdded = async (file) => {
      const { name } = file
      const dsName = name.slice(0, name.lastIndexOf('.'))
      await nextTick()
      editor.value.fillDatasetName(dsName)
    }

    const onFileRemoved = async (file, { replacing = false } = {}) => {
      state.uploads[file.extension.toLowerCase()] = false
      if (Object.values(state.uploads).every((flag) => !flag)) {
        // Get a new storage key, because the old uploads may have different filenames which would cause later issues
        // when trying to determine which file to use if they were uploaded to the same prefix.
        await fetchStorageKey({ keepUploader: replacing })
      } else {
        state.status = 'READY'
      }
    }

    const onUploadStart = () => {
      state.status = 'UPLOADING'
    }

    const onUploadComplete = (result) => {
      for (const file of result.failed) {
        state.uploads[file.extension.toLowerCase()] = false
      }
      for (const file of result.successful) {
        state.uploads[file.extension.toLowerCase()] = true
        state.fileSize[file.extension.toLowerCase()] = file.size
      }

      if (state.uploads.imzml === true && state.uploads.ibd === true) {
        const [file] = result.successful
        const uploadURL = file?.uploadURL

        try {
          state.inputPath = createInputPath(uploadURL, uuid.value)
        } catch (e) {
          // failed to create input path, reset the state so user can reupload and report error
          onFileRemoved({ extension: 'imzml' })
          onFileRemoved({ extension: 'ibd' })
          reportError(JSON.stringify(result)) // TODO: Remove after read logs in production
          return
        }
        state.status = 'UPLOADED'
      } else {
        if (result.failed.length) {
          reportError()
        }
        state.status = 'READY'
      }
    }

    const onSubmit = () => {
      // Prevent duplicate submissions if user double-clicks
      if (state.status === 'SUBMITTING') return

      if (state.status !== 'UPLOADED') {
        // Validate before arming "submit after upload": a form with gaps must not enter the submitting state.
        // getFormValueForSubmit reports the gaps itself; focus the first missing metadata field.
        if (editor.value.getFormValueForSubmit() === null) {
          const first = editor.value.v2?.status?.value?.missingRequired?.[0]
          if (first) editor.value.v2.requestFocus(first.key)
          return
        }
        if (presentCount.value === 0) {
          ElMessage({ message: 'Add the .imzML and .ibd files to upload first.', type: 'warning' })
          return
        }
        state.autoSubmit = true
      } else {
        submitForm()
      }
    }

    const submitForm = async () => {
      state.otherErrors = []
      const formValue = editor.value.getFormValueForSubmit()
      if (formValue === null) return

      state.status = 'SUBMITTING'
      const { metadataV2Json, metaspaceOptions } = formValue
      const performEnrichment = metaspaceOptions.performEnrichment
      delete metaspaceOptions.performEnrichment
      try {
        await apolloClient.mutate({
          mutation: createDatasetQuery,
          variables: {
            input: {
              inputPath: state.inputPath,
              metadataV2Json,
              sizeHashJson: JSON.stringify({ imzml_size: state.fileSize?.imzml, ibd_size: state.fileSize?.ibd }),
              ...metaspaceOptions,
            },
            useLithops: config.features.lithops,
            performEnrichment,
          },
        })

        state.inputPath = null
        state.validationErrors = []
        state.otherErrors = []
        // Reset upload state to allow new uploads
        state.uploads = {
          imzml: false,
          ibd: false,
        }
        state.fileSize = {
          imzml: false,
          ibd: false,
        }
        state.status = 'INIT'
        await fetchStorageKey()
        editor.value.resetAfterSubmit()
        ElMessage({
          message: 'Your dataset was successfully submitted!',
          type: 'success',
        })
      } catch (err) {
        let graphQLError = null
        try {
          graphQLError = JSON.parse(err.graphQLErrors[0].message)
        } catch (err2) {
          /* The case where err does not contain a graphQL error is handled below */
        }

        if (get(err, 'graphQLErrors[0].isHandled')) {
          return false
        } else if (graphQLError && graphQLError.type === 'failed_validation') {
          state.validationErrors = graphQLError.validation_errors
          state.otherErrors = mapServerErrors(graphQLError.validation_errors || []).otherErrors
          ElMessage({
            message: 'Please fix the highlighted fields and submit again',
            type: 'error',
          })
        } else if (graphQLError && graphQLError.type === 'wrong_moldb_name') {
          editor.value.resetMetaboliteDatabase()
          ElMessage({
            message:
              'An unrecognized metabolite database was selected. This field has been cleared, ' +
              'please select the databases again and resubmit the form.',
            type: 'error',
          })
        } else if (err?.message?.includes('limit')) {
          ElMessage({
            message:
              'You have reached the limit of private datasets you can submit. ' +
              'Please <a href="/plans">upgrade your plan</a>.',
            dangerouslyUseHTMLString: true,
            type: 'info',
            duration: 0,
            showClose: true,
          })
        } else {
          ElMessage({
            message:
              'There was an unexpected problem submitting the dataset. Please refresh the page and try again. ' +
              'If this problem persists, please contact us at ' +
              '<a href="mailto:contact@metaspace2020.org">contact@metaspace2020.org</a>',
            dangerouslyUseHTMLString: true,
            type: 'error',
            duration: 0,
            showClose: true,
          })
          throw err
        }
      } finally {
        if (state.status === 'SUBMITTING') {
          // i.e. if unsuccessful
          state.status = 'UPLOADED'
        }

        // check if group approval is pending
        if (metaspaceOptions.groupId) {
          const resp = await apolloClient.query({
            query: groupRoleQuery,
            variables: { groupIdOrSlug: metaspaceOptions.groupId },
          })
          state.group = resp.data.group
          state.showRequestedDialog = resp.data?.group?.currentUserRole === 'PENDING'
        }
      }
    }

    onMounted(() => {
      store.commit('updateFilter', store.getters.filter)
      fetchStorageKey()
      subscribeToMore(getSystemHealthSubscribeToMore)
    })

    const status = computed(() => state.status)

    watch(status, (status) => {
      if (status === 'UPLOADED' && state.autoSubmit) {
        state.autoSubmit = false
        submitForm()
      }
    })

    return {
      state,
      editor,
      enableUploads,
      isSignedIn,
      isTourRunning,
      submitDisabled,
      uploadedCount,
      onFilesChanged,
      presentCount,
      onSubmit,
      s3Options,
      uppyOptions,
      currentUser,
      onFileAdded,
      onFileRemoved,
      onUploadStart,
      onUploadComplete,
      systemHealth,
      cancel,
    }
  },
})
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
  max-width: 100%;
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

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 24px 0 14px;
}
.page-header > button {
  margin-left: 0;
}
.page-header__heading {
  margin: 0 auto 0 0;
  font-size: 15px;
  font-weight: 500;
  color: #102a42;
}
.upload-data-row {
  margin: 0;
}
.md-files-counter {
  font-size: 12px;
  color: #617f98;
}
.md-files-progress {
  width: 90px;
}
</style>
