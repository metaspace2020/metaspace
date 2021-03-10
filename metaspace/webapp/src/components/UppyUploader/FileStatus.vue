<template>
  <div
    class="w-full flex flex-col items-center justify-center text-sm leading-5 transition-opacity duration-300 overflow-hidden px-3"
    :class="{ 'opacity-50': status === 'DISABLED' }"
  >
    <div class="relative mt-3">
      <file-icon
        class="sm-file-icon bg-gray-100 h-6 w-6 block p-2 rounded-full"
        :class="{ 'bg-blue-100 sm-file-icon--active': status !== 'EMPTY' }"
      />
      <progress-ring
        v-if="showProgress"
        class="absolute top-0 left-0"
        :class="{
          'text-success': status === 'COMPLETE',
          'text-primary': status === 'UPLOADING',
          'text-danger': status === 'ERROR',
        }"
        :radius="20"
        :stroke="4"
        :progress="progress"
      />
      <fade-transition class="absolute top-0 left-0 -mt-3 -ml-6">
        <button
          v-if="status === 'ERROR'"
          key="retry"
          title="Retry file"
          class="button-reset text-gray-600 hover:text-primary focus:text-primary leading-none"
          @click.stop="$emit('retry')"
        >
          <i class="text-inherit text-lg el-icon-refresh-left" />
        </button>
      </fade-transition>
      <fade-transition class="absolute top-0 right-0 -mt-3 -mr-6">
        <button
          v-if="!(['EMPTY', 'DISABLED'].includes(status))"
          key="remove"
          title="Remove file"
          class="button-reset text-gray-600 hover:text-primary focus:text-primary leading-none"
          @click.stop="$emit('remove')"
        >
          <i class="text-inherit text-lg el-icon-remove-outline" />
        </button>
      </fade-transition>
      <fade-transition class="absolute bottom-0 right-0 -mb-2 -mr-2">
        <check-icon
          v-if="status === 'COMPLETE'"
          class="sm-status-icon w-6 h-6 fill-current text-success"
        />
        <close-circle-icon
          v-if="status === 'ERROR'"
          class="sm-status-icon w-6 h-6 fill-current text-danger"
        />
      </fade-transition>
    </div>
    <p class="m-0 mt-2 font-medium w-full overflow-hidden flex justify-center">
      <span
        v-if="status !== 'EMPTY'"
        class="flex-shrink truncate"
      >
        {{ trimmedName }}
      </span>
      .{{ extension }}
      <span v-if="status === 'EMPTY'">&nbsp;file</span>
    </p>
    <fade-transition class="m-0">
      <p
        v-if="status === 'ERROR'"
        key="error"
        class="font-medium text-danger"
      >
        upload failed
      </p>
      <p
        v-else-if="status === 'COMPLETE'"
        key="complete"
        class="font-medium text-primary"
      >
        upload complete
      </p>
      <p
        v-else
        :key="status"
      >
        {{ statusText }}
      </p>
    </fade-transition>
  </div>
</template>
<script lang="ts">
import { defineComponent, computed } from '@vue/composition-api'

import FileIcon from '../../assets/inline/refactoring-ui/icon-document.svg'
import CheckIcon from '../../assets/inline/refactoring-ui/icon-check.svg'
import CloseCircleIcon from '../../assets/inline/refactoring-ui/icon-close-circle.svg'

import FadeTransition from '../../components/FadeTransition'
import ProgressRing from '../../components/ProgressRing'

export type FileStatusName = 'EMPTY' | 'PENDING' | 'UPLOADING' | 'COMPLETE' | 'ERROR' | 'DISABLED'

export interface FileStatusProps {
  extension: string
  name?: string
  progress?: number
  status: FileStatusName
}

export default defineComponent<FileStatusProps>({
  name: 'FileStatus',
  components: {
    FadeTransition,
    FileIcon,
    ProgressRing,
    CheckIcon,
    CloseCircleIcon,
  },
  props: {
    name: String,
    extension: String,
    progress: Number,
    status: String,
  },
  setup(props) {
    return {
      trimmedName: computed(() => props.name?.split('.').slice(0, -1).join('.')),
      showProgress: computed(() => props.progress ?? false),
      statusText: computed(() => {
        switch (props.status) {
          case 'EMPTY':
            return 'required'
          case 'PENDING':
            return 'pending'
          default:
            return `${props.progress ?? 0}% uploaded`
        }
      }),
    }
  },
})
</script>
<style scoped>
.sm-file-icon .primary {
  @apply fill-current text-gray-400;
}
.sm-file-icon .secondary {
  @apply fill-current text-gray-500;
}
.sm-file-icon--active .primary {
  @apply text-blue-500;
}
.sm-file-icon--active .secondary {
  @apply text-blue-600;
}
.sm-status-icon .secondary {
  @apply fill-current text-white;
}
</style>
