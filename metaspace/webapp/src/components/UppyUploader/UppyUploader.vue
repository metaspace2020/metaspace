<template>
  <fade-transition class="flex items-center justify-around px-24 h-32">
    <dropzone
      v-if="state.status === 'IDLE'"
      :id="$attrs.id"
      key="idle"
      :accept="accept"
      @upload="addFile"
    >
      <file-status
        v-for="ext of requiredFiles"
        :key="ext"
        status="EMPTY"
        :file-name="`${ext} file`"
      />
    </dropzone>
    <div
      v-if="state.status === 'UPLOADING'"
      key="uploading"
    >
      <file-status
        :status="status"
        :button-click-handler="buttonClickHandler"
        :file-name="state.fileName"
        :progress="state.progress"
      />
    </div>
  </fade-transition>
</template>
<script lang="ts">
import { defineComponent, reactive, onUnmounted, computed } from '@vue/composition-api'
import Uppy, { UppyOptions } from '@uppy/core'
import AwsS3Multipart from '@uppy/aws-s3-multipart'

import FadeTransition from '../../components/FadeTransition'

import Dropzone from './Dropzone.vue'
import FileStatus from './FileStatus.vue'

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
  error: boolean
  fileName: string | null
  progress: number
  status: 'IDLE' | 'UPLOADING' | 'ERROR'
}

interface Props {
  disabled: boolean
  removeFile: () => void
  uploadSuccessful: (filename: string, filePath: string) => void
  uppyOptions: UppyOptions
  requiredFiles: string[]
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
    requiredFiles: Array,
  },
  setup(props, { attrs }) {
    const state = reactive<State>({
      error: false,
      fileName: null,
      progress: 0,
      status: 'IDLE',
    })

    preventDropEvents()

    const uppy = Uppy(props.uppyOptions)
      .use(AwsS3Multipart, {
        limit: 2,
        companionUrl: props.companionURL,
      })
      .on('file-added', file => {
        state.fileName = file.name
        state.status = 'UPLOADING'
      })
      .on('upload', () => {
        state.error = false
        state.progress = 0
      })
      .on('upload-progress', (file) => {
        const { percentage } = file.progress
        if (percentage > state.progress) {
          state.progress = file.progress.percentage
        }
      })
      .on('upload-success', async(file, result) => {
        props.uploadSuccessful(file.name, result.uploadURL)
        state.progress = 100
      })
      .on('upload-error', () => {
        state.error = true
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
      state.fileName = null
      state.progress = 0
      state.error = false
      state.status = 'IDLE'
    }

    return {
      addFile,
      state,
      accept: computed(() => props.uppyOptions?.restrictions?.allowedFileTypes),
      status: computed(() => {
        if (props.disabled) {
          return 'DISABLED'
        } else if (state.error) {
          return 'ERROR'
        } else if (state.progress === 100) {
          return 'COMPLETE'
        } else {
          return 'UPLOADING'
        }
      }),
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
