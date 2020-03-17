import { createComponent, reactive, onMounted, onBeforeUnmount } from '@vue/composition-api'
import { EditorContent, EditorMenuBar } from 'tiptap'
import { Placeholder } from 'tiptap-extensions'

import FadeTransition from '../../components/FadeTransition'
import MenuItems from './MenuItems'

import useEditor from './useEditor'
import { OnEscape } from './tiptap'

interface Props {
  content: string
  placeholder: string
  readonly: boolean
}

const RichText = createComponent<Props>({
  props: {
    content: String,
    placeholder: String,
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
        ].concat(
          props.placeholder ? new Placeholder({
            emptyNodeText: props.placeholder,
            emptyNodeClass: 'sm-RichText-placeholder',
            showOnlyWhenEditable: false,
          }) : [],
        ),
        editable: !props.readonly,
        content: props.content,
        onUpdate: (content) => emit('update', content),
      }),
      editing: false,
    })

    const { editor } = state

    if (!props.readonly) {
      editor.on('focus', () => { state.editing = true })

      const onOutclick = () => { state.editing = false }

      onMounted(() => {
        document.body.addEventListener('click', onOutclick)
      })

      onBeforeUnmount(() => {
        document.body.removeEventListener('click', onOutclick)
      })
    }

    const stopPropagation = (e: Event) => { e.stopPropagation() }

    const handleEditorClick = (e: Event) => {
      e.stopPropagation()
      if (!props.readonly && !state.editing) {
        editor.focus()
      }
    }

    return () => (
      <section class="sm-RichText">
        {!props.readonly && (
          <header class="flex items-end h-8 mb-1">
            <FadeTransition>
              {state.editing
                ? <div onClick={stopPropagation}>
                  <EditorMenuBar editor={editor}>
                    <MenuItems editor={editor} />
                  </EditorMenuBar>
                </div>
                : <button
                  onClick={handleEditorClick}
                  class="button-reset text-sm italic text-gray-700 px-4 leading-6"
                >
                  <i class="el-icon-edit" /> click to edit
                </button>}
            </FadeTransition>
          </header>
        )}
        <div onClick={stopPropagation}>
          <EditorContent
            class={[
              'transition-colors ease-in-out duration-300 rounded',
              { 'bg-transparent': !state.editing },
              { 'bg-gray-100': state.editing },
            ]}
            editor={editor}
          />
        </div>
      </section>
    )
  },
})

export default RichText
