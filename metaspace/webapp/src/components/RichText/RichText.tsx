import { createComponent, onMounted, onBeforeUnmount, reactive } from '@vue/composition-api'
import { EditorContent, EditorMenuBar } from 'tiptap'

import FadeTransition from '../../components/FadeTransition'
import MenuItems from './MenuItems'

import useEditor from './useEditor'
import { OnEscape } from './tiptap'

interface Props {
  content: string
  readonly: boolean
}

const RichText = createComponent<Props>({
  props: {
    content: String,
    readonly: Boolean,
  },
  setup(props, { emit }) {
    const state = reactive({
      editor: useEditor({
        extensions: [
          new OnEscape(() => {
            editor.editing = false
            state.editor.blur()
          }),
        ],
        editable: !props.readonly,
        content: props.content,
        onUpdate: (content) => emit('update', content),
      }),
    })

    const { editor } = state

    const handleEditorClick = (e: Event) => {
      e.stopPropagation()
      if (!props.readonly && !editor.editing) {
        editor.focus()
      }
    }

    return () => (
      <section class="sm-RichText" onClick={handleEditorClick}>
        {!props.readonly && (
          <header class="flex items-baseline h-8 mb-2">
            <FadeTransition>
              {editor.editing
                ? <EditorMenuBar editor={editor}>
                  <MenuItems editor={editor} />
                </EditorMenuBar>
                : <p class="text-sm italic text-gray-700 px-4 leading-6 cursor-pointer">
                  <i class="el-icon-edit" /> click to edit
                </p>}
            </FadeTransition>
          </header>
        )}
        <EditorContent
          class={[
            'p-4 transition-colors ease-in-out duration-300 rounded',
            { 'bg-transparent': !editor.editing },
            { 'bg-gray-200': editor.editing },
          ]}
          editor={editor}
        />
      </section>
    )
  },
})

export default RichText
