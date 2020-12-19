<template>
  <div
    :class="[
      'text-base leading-6 text-gray-700 box-border outline-none',
      'transition-all ease-in-out duration-150',
      'border-2 border-dashed border-gray-400 focus:border-primary',
      { 'border-primary': state.dragover, 'cursor-pointer hover:border-gray-600': !disabled },
    ]"
    :tabindex="disabled ? undefined : '0'"
    title="Drag and drop, or click to browse"
    @click="openFilePicker"
    @drop="handleDrop"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @keyup="handleKeyup"
  >
    <slot>
      <p class="m-0 font-medium pointer-events-none text-left p-3 mx-auto">
        Drag and drop, or click to browse
      </p>
    </slot>
    <input
      ref="input"
      type="file"
      hidden
      :accept="accept"
      :multiple="multiple"
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
  disabled: boolean
  multiple: boolean
}

export default defineComponent<Props>({
  name: 'Dropzone',
  props: {
    accept: Array,
    disabled: Boolean,
    multiple: Boolean,
  },
  setup(props, { emit }) {
    const state = reactive<State>({
      dragover: false,
    })

    const input = ref<HTMLInputElement | null>(null)
    const openFilePicker = () => {
      if (props.disabled) {
        return
      }
      if (input.value !== null) {
        input.value.click()
      }
    }

    const onInputChange = (e: Event) => {
      const target = e.target as HTMLInputElement
      if (target.files !== null && target.files.length) {
        emit('upload', Array.from(target.files))
        target.value = ''
      }
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      state.dragover = false

      if (props.disabled) {
        return
      }

      if (e.dataTransfer?.files.length) {
        emit('upload', Array.from(e.dataTransfer.files))
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (props.disabled) {
        return
      }

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
