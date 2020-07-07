import { createComponent, reactive, ref, onUnmounted, watch } from '@vue/composition-api'
import Uppy from '@uppy/core'
import AwsS3Multipart from '@uppy/aws-s3-multipart'

import FadeTransition from '../../components/FadeTransition'

import IdleState from './IdleState'
import HasFileState from './HasFileState'

import config from '../../lib/config'

const uppyOptions = {
  debug: true,
  autoProceed: true,
  restrictions: {
    maxFileSize: 150 * 2 ** 20, // 150MB
    maxNumberOfFiles: 1,
    allowedFileTypes: ['.tsv', '.csv'],
  },
  meta: {},
}

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
  error: string | null
  fileName: string | null
  progress: number
  status: 'IDLE' | 'HAS_FILE' | 'ERROR'
}

interface Props {
  disabled: boolean
  removeFile: () => void
  uploadSuccessful: (filename: string, filePath: string) => void
}

const UppyUploader = createComponent<Props>({
  inheritAttrs: false,
  props: {
    disabled: Boolean,
    formatError: Function,
    removeFile: Function,
    uploadSuccessful: { type: Function, required: true },
  },
  setup(props, { attrs }) {
    const state = reactive<State>({
      error: null,
      fileName: null,
      progress: 0,
      status: 'IDLE',
    })

    preventDropEvents()

    const uppy = Uppy(uppyOptions)
      .use(AwsS3Multipart, {
        limit: 2,
        companionUrl: config.companionUrl || `${window.location.origin}/database_upload`,
      })
      .on('file-added', file => {
        state.fileName = file.name
      })
      .on('upload', () => {
        state.progress = 0
        state.status = 'HAS_FILE'
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
        state.status = 'ERROR'
        state.error = uppy.getState().error || null
      })

    const uppyFiles = ref(uppy.state.files)
    watch(() => uppyFiles.value, files => console.log(files))

    const addFile = (file: File) => {
      const descriptor = {
        source: attrs.id,
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

    const removeFile = () => {
      uppy.reset()
      if (props.removeFile) {
        props.removeFile()
      }
      state.fileName = null
      state.progress = 0
      state.status = 'IDLE'
    }

    const commonClasses = `flex flex-col items-center justify-center ${attrs.class || ''}`

    return () => {
      let content

      if (state.status === 'HAS_FILE') {
        content = (
          <HasFileState
            class={commonClasses}
            disabled={props.disabled}
            fileName={state.fileName}
            progress={state.progress}
            removeFile={removeFile}
          />
        )
      } else if (state.status === 'ERROR') {
        content = (
          <div key={state.status} class={[commonClasses]}>
            {state.error}
          </div>
        )
      } else {
        content = (
          <IdleState
            accept={uppyOptions.restrictions.allowedFileTypes}
            class={commonClasses}
            id={attrs.id}
            upload={addFile}
          />
        )
      }

      return (
        <FadeTransition>
          {content}
        </FadeTransition>
      )
    }
  },
})

export default UppyUploader
