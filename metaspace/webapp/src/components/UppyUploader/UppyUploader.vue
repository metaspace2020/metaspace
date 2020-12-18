<template>
  <fade-transition class="flex items-center px-6 h-32">
    <dropzone
      v-if="state.status === 'DROPPING'"
      :id="$attrs.id"
      key="drop"
      :accept="accept"
      :multiple="multiple"
      @upload="addFiles"
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
import { defineComponent, reactive, onUnmounted, computed, watch } from '@vue/composition-api'
import Uppy, { UppyOptions, UppyFile } from '@uppy/core'
import AwsS3Multipart, { AwsS3MultipartOptions } from '@uppy/aws-s3-multipart'

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
  status: 'DROPPING' | 'UPLOADING' | 'ERROR'
}

interface Props {
  disabled: boolean
  removeFile: () => void
  requiredFileTypes: string[]
  s3Options: AwsS3MultipartOptions,
  uploadSuccessful: (filename: string, filePath: string) => void
  options: UppyOptions
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
    disabled: Boolean,
    formatError: Function,
    removeFile: Function,
    uploadSuccessful: { type: Function, required: true },
    options: Object,
    s3Options: Object,
    requiredFileTypes: Array,
  },
  setup(props, { attrs }) {
    // TODO: build multiple file state
    const state = reactive<State>({
      status: 'DROPPING',
    })

    preventDropEvents()

    const uppy = Uppy({ ...props.options, store: createStore() })
      .on('file-added', file => {

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

    if (props.s3Options) {
      uppy.use(AwsS3Multipart, {
        limit: 2,
        ...props.s3Options,
      })

      watch(() => props.s3Options, (newOpts) => {
        uppy.getPlugin('AwsS3Multipart').setOptions(newOpts)
      })
    }

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

    const addFiles = (files: File[]) => {
      try {
        for (const file of files) {
          uppy.addFile({
            name: file.name,
            type: file.type,
            data: file,
          })
        }
      } catch (err) {
        uppy.log(err)
      }
    }

    const handleRemoveFile = () => {
      uppy.reset()
      if (props.removeFile) {
        props.removeFile()
      }
      state.status = 'DROPPING'
    }

    return {
      addFiles,
      state,
      files,
      accept: computed(() => props.options?.restrictions?.allowedFileTypes),
      multiple: computed(() => {
        if (props.requiredFileTypes) {
          return props.requiredFileTypes.length > 1
        }
        if (props.options?.restrictions) {
          const { maxNumberOfFiles } = props.options.restrictions
          return (
            maxNumberOfFiles === undefined
            || maxNumberOfFiles === null
            || maxNumberOfFiles > 1
          )
        }
        return true
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
