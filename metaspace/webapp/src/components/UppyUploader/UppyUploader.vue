<template>
  <dropzone
    :id="$attrs.id"
    class="flex items-center justify-evenly px-6 h-32"
    :accept="accept"
    :multiple="multiple"
    :disabled="state.status === 'UPLOADING'"
    @upload="addFiles"
  >
    <file-status
      v-for="f of files"
      :key="f.id || f.fileName"
      v-bind="f"
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
  currentUser: any
  options: UppyOptions
  requiredFileTypes: string[]
  s3Options: AwsS3MultipartOptions
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
    options: Object,
    requiredFileTypes: Array,
    s3Options: Object,
    currentUser: Object,
  },
  setup(props, { emit }) {
    const state = reactive<State>({
      status: 'DROPPING',
    })

    preventDropEvents()

    const uppy = Uppy({ ...props.options, store: createStore() })
      .on('file-added', (file) => {
        emit('file-added', file)
      })
      .on('file-removed', (file) => {
        emit('file-removed', file)
      })
      .on('upload', () => {
        state.status = 'UPLOADING'
        emit('upload')
      })
      .on('upload-error', (...args) => {
        console.log(args)
      })
      .on('error', (...args) => {
        console.log(args)
      })
      .on('complete', result => {
        emit('complete', result)
      })

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
        return props.requiredFileTypes
          .map(ext => {
            const matchingFile = files.find(f => f.extension.toLowerCase() === ext.toLowerCase())
            return {
              id: matchingFile?.id,
              name: matchingFile?.name,
              extension: matchingFile?.extension || ext,
              progress: matchingFile?.progress?.percentage,
              status: getFileStatus(matchingFile),
            }
          })
      }
      return files.map(f => ({
        id: f.id,
        name: f.name,
        extension: f.extension,
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
            meta: { user: props.currentUser?.id, source: 'webapp' },
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
