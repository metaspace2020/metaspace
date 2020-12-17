<template>
  <fade-transition class="flex items-center px-6 h-32">
    <dropzone
      v-if="state.status === 'DROP-ACTIVE'"
      :id="$attrs.id"
      key="drop"
      :accept="accept"
      @upload="addFile"
    >
      <file-status
        v-for="f of files"
        :key="f.id || f.fileName"
        :status="f.status"
        :file-name="f.fileName"
      />
    </dropzone>
    <div
      v-if="state.status === 'UPLOADING'"
      key="uploading"
    >
      <file-status
        v-for="f of files"
        :key="f.id"
        :status="f.status"
        :file-name="f.fileName"
        :progress="f.progress"
        @action-button="buttonClickHandler"
      />
    </div>
  </fade-transition>
</template>
<script lang="ts">
import { defineComponent, reactive, onUnmounted, computed } from '@vue/composition-api'
import Uppy, { UppyOptions, UppyFile } from '@uppy/core'
import AwsS3Multipart from '@uppy/aws-s3-multipart'

import FadeTransition from '../../components/FadeTransition'

import Dropzone from './Dropzone.vue'
import FileStatus, { FileStatusName } from './FileStatus.vue'

import createStore from './store'
import config from '../../lib/config'

function preventDropEvents() {
  const preventDefault = (e: Event) => {
    e.preventDefault()
  }
  window.addEventListener('dragover', preventDefault, false)
  window.addEventListener('drop', preventDefault, false)

  onUnmounted(() => {
    window.removeEventListener('dragover', preventDefault)
    window.removeEventListener('drop', preventDefault)
  })
}

interface State {
  status: 'DROP-ACTIVE' | 'UPLOADING' | 'ERROR'
}

interface Props {
  disabled: boolean
  removeFile: () => void
  uploadSuccessful: (filename: string, filePath: string) => void
  uppyOptions: UppyOptions
  requiredFileTypes: string[]
  companionURL: string
}

const UppyUploader = defineComponent<Props>({
  name: 'UppyUploader',
  inheritAttrs: false, // class is passed down to child components
  components: {
    Dropzone,
    FileStatus,
    FadeTransition,
  },
  props: {
    companionURL: { type: String, required: true },
    disabled: Boolean,
    formatError: Function,
    removeFile: Function,
    uploadSuccessful: { type: Function, required: true },
    uppyOptions: Object,
    requiredFileTypes: Array,
  },
  setup(props, { attrs }) {
    // TODO: build multiple file state
    const state = reactive<State>({
      status: 'DROP-ACTIVE',
    })

    preventDropEvents()

    console.log(props.uppyOptions)

    const uppy = Uppy({ ...props.uppyOptions, store: createStore() })
      .use(AwsS3Multipart, {
        limit: 2,
        companionUrl: props.companionURL,
      })
      .on('file-added', file => {
        console.log(file)
        // state.fileName = file.name
        // TODO: reconcile required files before uploading
        // state.status = 'UPLOADING'
      })
      .on('upload-success', async(file, result) => {
        console.log(file, result)
        // props.uploadSuccessful(file.name, result.uploadURL)
        // state.progress = 100
      })
      // .on('upload-error', () => {
      //   state.error = true
      // })

    function getFileStatus(file?: UppyFile) : FileStatusName {
      if (props.disabled) {
        return 'DISABLED'
      }
      if (file === undefined) {
        return 'EMPTY'
      }
      if (file.response && file.response.status !== 200) {
        return 'ERROR'
      }
      if (file.progress?.uploadStarted) {
        return 'UPLOADING'
      }
      if (file.progress?.uploadComplete) {
        return 'COMPLETE'
      }
      return 'PENDING'
    }

    const files = computed(() => {
      const files = uppy.getFiles()
      if (props.requiredFileTypes) {
        return props.requiredFileTypes.map(ext => {
          const matchingFile = files.find(f => f.extension === ext)
          return {
            id: matchingFile?.id,
            fileName: matchingFile?.name || `.${ext} file`,
            progress: matchingFile?.progress?.percentage,
            status: getFileStatus(matchingFile),
          }
        })
      }
      return files.map(f => ({
        id: f.id,
        fileName: f.name,
        progress: f.progress?.percentage,
        status: getFileStatus(f),
      }))
    })

    const addFile = (file: File) => {
      const descriptor = {
        name: file.name,
        type: file.type,
        data: file,
      }
      try {
        uppy.addFile(descriptor)
      } catch (err) {
        uppy.log(err)
      }
    }

    const handleRemoveFile = () => {
      uppy.reset()
      if (props.removeFile) {
        props.removeFile()
      }
      state.status = 'DROP-ACTIVE'
    }

    return {
      addFile,
      state,
      files,
      accept: computed(() => props.uppyOptions?.restrictions?.allowedFileTypes),
      buttonClickHandler() {
        if (status === 'ERROR') {
          uppy.retryAll()
        } else {
          handleRemoveFile()
        }
      },
    }
  },
})

export default UppyUploader
</script>
