import { createComponent, reactive, ref } from '@vue/composition-api'

interface State {
  dragover: boolean,
}

interface Props {
  accept: string[]
  upload: (files: File) => void
}

export default createComponent<Props>({
  props: {
    accept: Array,
    upload: { type: Function, required: true },
  },
  setup(props) {
    const state = reactive<State>({
      dragover: false,
    })

    const input = ref<HTMLInputElement>(null)
    const openFilePicker = () => {
      if (input.value !== null) {
        input.value.click()
      }
    }

    const onInputChange = (e: Event) => {
      const target = e.target as HTMLInputElement
      if (target.files !== null && target.files.length) {
        props.upload(target.files[0])
        target.value = ''
      }
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.dataTransfer?.files.length) {
        props.upload(e.dataTransfer.files[0])
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

    return () => (
      <div
        class={[
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
        <input
          ref="input"
          type="file"
          hidden
          accept={props.accept}
          onChange={onInputChange}
        />
      </div>
    )
  },
})
