import { createComponent, reactive, ref, onUnmounted } from '@vue/composition-api'
import Uppy from '@uppy/core'
import AwsS3Multipart from '@uppy/aws-s3-multipart'

import config from '../../lib/config'

const uppyOptions = {
  debug: true,
  autoProceed: true,
  restrictions: {
    maxFileSize: 150 * 2 ** 20, // 150MB
    maxNumberOfFiles: 1,
    allowedFileTypes: ['.csv'],
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
  status: string
}

interface Props {
  uploadSuccessful: (filename: string, filePath: string) => void
}

const UppyUploader = createComponent<Props>({
  props: {
    uploadSuccessful: { type: Function, required: true },
  },
  setup(props, { attrs }) {
    const state = reactive<State>({
      status: 'IDLE',
      fileName: null,
      progress: 0,
      error: null,
    })

    const input = ref<HTMLInputElement>(null)
    const openFilePicker = () => {
      if (input.value !== null) {
        input.value.click()
      }
    }

    preventDropEvents()

    const uppy = Uppy(uppyOptions)
      .use(AwsS3Multipart, {
        limit: 2,
        companionUrl: config.companionUrl || `${window.location.origin}/database_upload`,
      })
      .on('upload', (...args) => {
        state.status = 'UPLOADING'
      })
      .on('error', () => {
        state.status = 'ERROR'
        state.error = uppy.getState().error || null
      })
      .on('upload-success', async(file, result) => {
        props.uploadSuccessful(file.name, result.uploadURL)
        state.fileName = file.name
        state.status = 'COMPLETE'
      })

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

    const onInputChange = (e: Event) => {
      uppy.log('[DragDrop] Files selected through input')
      const target = e.target as HTMLInputElement
      if (target.files !== null && target.files.length) {
        addFile(target.files[0])
        target.value = ''
      }
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      uppy.log('[DragDrop] Files were dropped')
      if (e.dataTransfer?.files.length) {
        addFile(e.dataTransfer.files[0])
      } else {
        state.status = 'IDLE'
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
      state.status = 'DRAGOVER'
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      state.status = 'IDLE'
    }

    const getStatusMessage = (status: string) => {
      switch (status) {
        case 'UPLOADING':
          return 'Uploading...'
        case 'ERROR':
          return state.error
        case 'COMPLETE':
          return state.fileName
        default:
          return 'Drag and drop, or click to browse'
      }
    }

    return () => (
      <div
        class={[
          'h-48 bg-gray-100 text-gray-700 flex items-center justify-center cursor-pointer',
          'transition-colors ease-in-out duration-150',
          'outline-none border-2 border-dashed border-gray-500 hover:border-gray-700',
          'focus:border-primary focus:text-primary focus:bg-blue-100',
          { 'border-primary text-primary bg-blue-100': state.status === 'DRAGOVER' },
        ]}
        tabindex="0"
        onClick={openFilePicker}
        onDrop={handleDrop}
        onDragover={handleDragOver}
        onDragleave={handleDragLeave}
        onKeyup={(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.keyCode === 13) {
            openFilePicker()
          }
        }}
      >
        <input
          ref="input"
          type="file"
          hidden
          multiple={uppyOptions.restrictions.maxNumberOfFiles !== 1}
          accept={uppyOptions.restrictions.allowedFileTypes}
          onChange={onInputChange}
        />
        <p class="m-0 font-medium pointer-events-none text-left p-6">
          {getStatusMessage(state.status)}
        </p>
      </div>
    )
  },
})

export default UppyUploader
