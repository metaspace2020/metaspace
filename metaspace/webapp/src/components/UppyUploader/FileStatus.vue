<template>
  <div
    class="flex flex-col items-center justify-center text-sm leading-5 transition-opacity duration-300"
    :class="{ 'opacity-50': status === 'DISABLED' }"
  >
    <div class="relative sm-custom-margin">
      <file-icon
        class="sm-stateful-icon h-8 w-8 block p-2 bg-gray-100 rounded-full"
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
        :radius="24"
        :stroke="4"
        :progress="progress"
      />
      <fade-transition class="absolute top-0 right-0 -mt-3 -mr-6">
        <button
          v-if="['PENDING', 'COMPLETE', 'ERROR'].includes(status)"
          :key="status"
          class="button-reset text-gray-600 hover:text-primary focus:text-primary"
          :title="status === 'ERROR' ? 'Retry file' : 'Remove file'"
          @click="buttonClickHandler"
        >
          <i
            class="text-inherit text-lg"
            :class="status === 'ERROR' ? 'el-icon-refresh' : 'el-icon-error'"
          />
        </button>
      </fade-transition>
    </div>
    <p class="m-0 font-medium sm-custom-margin">
      {{ fileName }}
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

interface Props {
  buttonClickHandler?: () => void
  fileName: string
  progress?: number
  status: 'EMPTY' | 'PENDING' | 'UPLOADING' | 'COMPLETE' | 'ERROR' | 'DISABLED'
}

export default defineComponent<Props>({
  name: 'FileStatus',
  components: {
    FadeTransition,
    FileIcon,
    ProgressRing,
  },
  props: {
    buttonClickHandler: Function,
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
            return `${props.progress}%`
        }
      }),
    }
  },
})
</script>
<style scoped>
.sm-custom-margin {
  margin-top: calc(theme('spacing.3') / 2);
}
</style>
