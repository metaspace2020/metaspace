import { createComponent, reactive, ref, onUnmounted, watch } from '@vue/composition-api'
import Uppy from '@uppy/core'
import AwsS3Multipart from '@uppy/aws-s3-multipart'

import '../../components/ColourIcon.css'
import FileIcon from '../../assets/inline/refactoring-ui/document.svg'

import config from '../../lib/config'
import FadeTransition from '../../components/FadeTransition'

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
  dragover: boolean,
  error: string | null
  fileName: string | null
  progress: number
  status: 'IDLE' | 'HAS_FILE' | 'ERROR'
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
      dragover: false,
      error: null,
      fileName: null,
      progress: 0,
      status: 'IDLE',
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
      .on('file-added', file => {
        state.fileName = file.name
      })
      .on('upload', (...args) => {
        state.status = 'HAS_FILE'
        state.progress = 0
      })
      .on('upload-progress', (file) => {
        const { percentage } = file.progress
        if (percentage > state.progress) {
          state.progress = file.progress.percentage
        }
      })
      .on('error', () => {
        state.status = 'ERROR'
        state.error = uppy.getState().error || null
      })
      .on('upload-success', async(file, result) => {
        props.uploadSuccessful(file.name, result.uploadURL)
        state.fileName = file.name
        state.progress = 100
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
        state.dragover = false
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
      state.dragover = true
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      state.dragover = false
    }

    const clearFile = () => {
      uppy.reset()

      state.dragover = false
      state.fileName = null
      state.progress = 0
      state.status = 'IDLE'
    }

    const commonClasses = 'h-48 flex flex-col items-center justify-center'

    return () => {
      let content

      if (state.status === 'HAS_FILE') {
        content = (
          <div key={state.status} class={[commonClasses, 'text-sm leading-5']}>
            <FadeTransition>
              { state.progress < 100
                ? <div class="text-center">
                  <p class="m-0">{state.progress}%</p>
                  <el-progress
                    class="w-48 mt-2"
                    percentage={state.progress}
                    show-text={false}
                  />
                </div>
                : <div class="relative">
                  <button
                    class={[
                      'button-reset absolute top-0 right-0 -mt-3 -mr-3',
                      'text-gray-600 hover:text-primary focus:text-primary',
                    ]}
                    title="Clear file"
                    onClick={clearFile}
                  >
                    <i class="el-icon-error text-inherit text-lg"></i>
                  </button>
                  <FileIcon class="sm-colour-icon sm-colour-icon--large" />
                </div>
              }
            </FadeTransition>
            <p class="m-0 mt-3 font-medium">
              {state.fileName}
            </p>
          </div>
        )
      } else if (status === 'ERROR') {
        content = (
          <div key={state.status} class={[commonClasses]}>
            {state.error}
          </div>
        )
      } else {
        content = (
          <div
            key={state.status}
            class={[
              commonClasses,
              'text-base leading-6 bg-gray-100 text-gray-700 cursor-pointer',
              'transition-colors ease-in-out duration-150',
              'box-border outline-none border-2 border-dashed border-gray-500 hover:border-gray-700',
              'focus:border-primary focus:text-primary focus:bg-blue-100',
              { 'border-primary text-primary bg-blue-100': state.dragover },
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
            <p class="m-0 font-medium pointer-events-none text-left p-6">
              Drag and drop, or click to browse
            </p>
          </div>
        )
      }

      return (
        <div>
          <FadeTransition>
            {content}
          </FadeTransition>
          <input
            ref="input"
            type="file"
            hidden
            multiple={uppyOptions.restrictions.maxNumberOfFiles !== 1}
            accept={uppyOptions.restrictions.allowedFileTypes}
            onChange={onInputChange}
          />
        </div>
      )
    }
  },
})

export default UppyUploader
