<template>
  <dropzone
    :id="$attrs.id"
    class="flex items-center px-6 h-32"
    :accept="accept"
    :multiple="multiple"
    :disabled="state.status === 'UPLOADING'"
    @upload="addFiles"
  >
    <file-status
      v-for="f of files"
      :key="f.id || f.fileName"
      :status="f.status"
      :file-name="f.fileName"
      :progress="f.progress"
      @remove="removeFile(f.id)"
      @retry="retryFile(f.id)"
    />
  </dropzone>
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
      .on('upload', () => {
        state.status = 'UPLOADING'
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
      // @ts-ignore - undocumented property
      if (file.error) {
        console.log(file.response)
        return 'ERROR'
      }
      if (file.progress?.uploadComplete) {
        return 'COMPLETE'
      }
      if (file.progress?.uploadStarted) {
        return 'UPLOADING'
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
      removeFile(id: string) {
        uppy.removeFile(id)
        state.status = 'DROPPING'
      },
      retryFile: uppy.retryUpload,
    }
  },
})

export default UppyUploader
</script>
