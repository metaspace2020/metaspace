<template>
  <dropzone
    v-if="variant === 'slots'"
    :id="$attrs.id"
    ref="dropzone"
    bare
    class="sm-uppy-slots"
    :accept="accept"
    :multiple="multiple"
    :disabled="state.status === 'UPLOADING'"
    @upload="addFiles"
  >
    <file-slot
      v-for="f of slotFiles"
      :key="f.extension"
      v-bind="f"
      @browse="browse"
      @replace="replaceFile(f.id)"
      @remove="removeFile(f.id)"
      @retry="retryFile(f.id)"
    />
  </dropzone>
  <dropzone
    v-else
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
import { defineComponent, reactive, onUnmounted, computed, watch, ref, nextTick, PropType } from 'vue'
import Uppy, { UppyOptions, UppyFile } from '@uppy/core'
import AwsS3Multipart, { AwsS3MultipartOptions } from '@uppy/aws-s3-multipart'

import Dropzone from './Dropzone.vue'
import FileStatus, { FileStatusName } from './FileStatus.vue'
import FileSlot from './FileSlot.vue'

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
  variant: UppyUploaderVariant
}

/** `classic`: one wide dropzone with a FileStatus per file; `slots`: a 2-column grid of FileSlot drop targets. */
export type UppyUploaderVariant = 'classic' | 'slots'

const UppyUploader = defineComponent({
  name: 'UppyUploader',
  inheritAttrs: false, // class is passed down to child components
  components: {
    Dropzone,
    FileStatus,
    FileSlot,
  },
  props: {
    disabled: Boolean,
    options: Object,
    requiredFileTypes: Array,
    s3Options: Object,
    currentUser: Object,
    variant: { type: String as PropType<UppyUploaderVariant>, default: 'classic' },
  },
  setup(props: Props | any, { emit }) {
    const state = reactive<State>({
      status: 'DROPPING',
    })

    preventDropEvents()

    let replacingId: string | null = null
    const uppy = new Uppy({ ...props.options, store: createStore() })
      .on('file-added', (file) => {
        emit('file-added', file)
      })
      .on('file-removed', (file) => {
        // second argument only for a Replace (slots variant), so the page can keep its upload context
        if (replacingId === file.id) emit('file-removed', file, { replacing: true })
        else emit('file-removed', file)
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
      .on('complete', (result) => {
        // the batch is over: re-enable the dropzone so remaining slots can be browsed/dropped again
        state.status = 'DROPPING'
        emit('complete', result)
      })

    if (props.s3Options) {
      uppy.use(AwsS3Multipart, {
        limit: 2,
        ...props.s3Options,
      } as any)

      watch(
        () => props.s3Options,
        (newOpts) => {
          uppy.getPlugin('AwsS3Multipart').setOptions(newOpts)
        }
      )
    }

    // Clean up Uppy instance when component is unmounted
    onUnmounted(() => {
      uppy.close()
    })

    function getFileStatus(file?: UppyFile): FileStatusName {
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
        return props.requiredFileTypes.map((ext) => {
          const matchingFile = files.find((f) => f.extension.toLowerCase() === ext.toLowerCase())
          return {
            id: matchingFile?.id,
            name: matchingFile?.name,
            extension: matchingFile?.extension || ext,
            progress: matchingFile?.progress?.percentage,
            status: getFileStatus(matchingFile),
          }
        })
      }
      return files.map((f) => ({
        id: f.id,
        name: f.name,
        extension: f.extension,
        progress: f.progress?.percentage,
        status: getFileStatus(f),
      }))
    })

    // slots variant: same entries plus the file size and, for a picked file that waits for its pair, the missing
    // extension (kept out of `files` so classic FileStatus attrs stay unchanged)
    const slotFiles = computed(() => {
      const missing = files.value.filter((f) => f.status === 'EMPTY').map((f) => f.extension)
      return files.value.map(({ id, name, extension, progress, status }) => ({
        id,
        name,
        extension,
        progress,
        status,
        size: id ? uppy.getFile(id)?.size ?? undefined : undefined,
        waitingFor: status === 'PENDING' && missing.length ? missing.join(', ') : undefined,
      }))
    })

    const dropzone = ref<InstanceType<typeof Dropzone> | null>(null)
    /** Opens the file picker once the dropzone is enabled again (after a Replace re-enables it). */
    const browse = async () => {
      await nextTick()
      dropzone.value?.openFilePicker()
    }

    // slots variant: per-type status for the page's "N of M files" counter. Watch a value signature, not the
    // array: `files` is rebuilt whenever the parent re-renders (e.g. an inline requiredFileTypes literal), and
    // emitting on every rebuild would loop through the parent's state.
    if (props.variant === 'slots') {
      const statusSignature = computed(() =>
        JSON.stringify(files.value.map(({ extension, status }) => [extension, status]))
      )
      watch(
        statusSignature,
        () =>
          emit(
            'files-changed',
            files.value.map(({ extension, status }) => ({ extension, status }))
          ),
        { immediate: true }
      )
    }

    const removeFile = (id: string) => {
      uppy.removeFile(id)
      state.status = 'DROPPING'
    }

    /** Replace (slots variant): remove the file flagged as a replacement, then open the picker. */
    const replaceFile = (id: string) => {
      replacingId = id
      try {
        removeFile(id)
      } finally {
        replacingId = null
      }
      browse()
    }

    const addFiles = (files: File[]) => {
      try {
        for (const file of files) {
          uppy.addFile({
            name: file.name,
            type: file.type,
            meta: { user: props.currentUser?.id, source: 'webapp', size: file.size },
            data: file,
          })
        }
        // start only once the restriction is met (e.g. both files of a pair): an early upload() only logs a
        // RestrictionError at error level
        const minFiles = props.options?.restrictions?.minNumberOfFiles ?? 1
        if (uppy.getFiles().length >= minFiles) uppy.upload()
      } catch (err: any) {
        uppy.log(err)
      }
    }

    return {
      addFiles,
      state,
      files,
      slotFiles,
      dropzone,
      browse,
      accept: computed(() => props.options?.restrictions?.allowedFileTypes),
      multiple: computed(() => {
        if (props.requiredFileTypes) {
          return props.requiredFileTypes.length > 1
        }
        if (props.options?.restrictions) {
          const { maxNumberOfFiles } = props.options.restrictions
          return maxNumberOfFiles === undefined || maxNumberOfFiles === null || maxNumberOfFiles > 1
        }
        return true
      }),
      removeFile,
      replaceFile,
      retryFile: uppy.retryUpload,
    }
  },
})

export default UppyUploader
</script>
<style scoped>
.sm-uppy-slots {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  border-radius: 6px;
  transition: box-shadow 150ms ease-in-out;
}
.sm-uppy-slots:focus-visible,
.sm-uppy-slots.is-dragover {
  box-shadow: 0 0 0 2px var(--el-color-primary);
}
@media (max-width: 767px) {
  .sm-uppy-slots {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
