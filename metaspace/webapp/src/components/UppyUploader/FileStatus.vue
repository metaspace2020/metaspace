<template>
  <div
    class="w-full flex flex-col items-center justify-center text-sm leading-5 transition-opacity duration-300"
    :class="{ 'opacity-50': status === 'DISABLED' }"
  >
    <div class="relative mt-3">
      <file-icon
        class="sm-stateful-icon h-6 w-6 block p-2 bg-gray-100 rounded-full"
        :class="{ 'sm-stateful-icon--active bg-blue-100': status !== 'EMPTY' }"
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
      <fade-transition class="absolute top-0 right-0 -mt-3 -mr-6 button-reset text-gray-600 hover:text-primary focus:text-primary leading-none">
        <button
          v-if="['PENDING', 'UPLOADING', 'COMPLETE'].includes(status)"
          key="remove"
          title="Remove file"
          @click.stop="$emit('remove')"
        >
          <i class="text-inherit text-lg el-icon-error" />
        </button>
        <button
          v-else-if="status === 'ERROR'"
          key="retry"
          title="Retry file"
          @click.stop="$emit('retry')"
        >
          <i class="text-inherit text-lg el-icon-refresh" />
        </button>
      </fade-transition>
    </div>
    <p class="m-0 font-medium mt-2 truncate">
      <span class="">{{ fileName }}</span>
    </p>
    <fade-transition class="m-0">
      <p
        v-if="status === 'ERROR'"
        key="error"
        class="font-medium text-danger"
      >
        Upload failed
      </p>
      <p
        v-else-if="status === 'COMPLETE'"
        key="complete"
        class="font-medium text-primary"
      >
        Upload complete
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

import '../../components/StatefulIcon.css'
import FileIcon from '../../assets/inline/refactoring-ui/document.svg'
import FadeTransition from '../../components/FadeTransition'
import ProgressRing from '../../components/ProgressRing'

export type FileStatusName = 'EMPTY' | 'PENDING' | 'UPLOADING' | 'COMPLETE' | 'ERROR' | 'DISABLED'

interface Props {
  fileName: string
  progress?: number
  status: FileStatusName
}

export default defineComponent<Props>({
  name: 'FileStatus',
  components: {
    FadeTransition,
    FileIcon,
    ProgressRing,
  },
  props: {
    fileName: String,
    progress: Number,
    status: String,
  },
  setup(props) {
    return {
      showProgress: computed(() => props.progress ?? false),
      statusText: computed(() => {
        switch (props.status) {
          case 'EMPTY':
            return 'required'
          case 'PENDING':
            return 'pending'
          default:
            return `${props.progress ?? 0}%`
        }
      }),
    }
  },
})
</script>
