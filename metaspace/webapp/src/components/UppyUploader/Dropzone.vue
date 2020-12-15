<template>
  <div
    :class="[
      'text-base leading-6 text-gray-700 cursor-pointer',
      'transition-colors ease-in-out duration-150',
      'box-border outline-none border-2 border-dashed border-gray-400 hover:border-gray-600 focus:border-primary',
      { 'border-primary': state.dragover },
    ]"
    tabindex="0"
    title="Drag and drop, or click to browse"
    @click="openFilePicker"
    @drop="handleDrop"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @keyup="handleKeyup"
  >
    <slot name="default">
      <p class="m-0 font-medium pointer-events-none text-left p-6">
        Drag and drop, or click to browse
      </p>
    </slot>
    <input
      ref="input"
      type="file"
      hidden
      :accept="accept"
      @change="onInputChange"
    />
  </div>
</template>
<script lang="ts">
import { defineComponent, reactive, ref } from '@vue/composition-api'

interface State {
  dragover: boolean,
}

interface Props {
  accept: string[]
}

export default defineComponent<Props>({
  name: 'Dropzone',
  props: {
    accept: Array,
  },
  setup(props, { emit }) {
    const state = reactive<State>({
      dragover: false,
    })

    const input = ref<HTMLInputElement | null>(null)
    const openFilePicker = () => {
      if (input.value !== null) {
        input.value.click()
      }
    }

    const onInputChange = (e: Event) => {
      const target = e.target as HTMLInputElement
      if (target.files !== null && target.files.length) {
        emit('upload', target.files[0])
        target.value = ''
      }
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.dataTransfer?.files.length) {
        emit('upload', e.dataTransfer.files[0])
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

    return {
      input,
      state,
      onInputChange,
      openFilePicker,
      handleDrop,
      handleDragOver,
      handleDragLeave,
      handleKeyup: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
          openFilePicker()
        }
      },
    }
  },
})

</script>
