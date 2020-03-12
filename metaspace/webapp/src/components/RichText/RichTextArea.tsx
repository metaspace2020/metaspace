import { createComponent, onMounted, onBeforeUnmount, reactive } from '@vue/composition-api'
import { Editor, EditorContent } from 'tiptap'
import {
  Bold,
  BulletList,
  HardBreak,
  Heading,
  History,
  Italic,
  Link,
  ListItem,
  Underline,
} from 'tiptap-extensions'
import { debounce } from 'lodash-es'

import FadeTransition from '../../components/FadeTransition'
import MenuBar from './MenuBar'

import { Sub, Sup, OnEscape } from './tiptap'

interface Props {
  content: string
  formMode: boolean
  onUpdate: (...args: any[]) => any
  readonly: boolean
}

const RichText = createComponent<Props>({
  props: {
    content: String,
    formMode: Boolean,
    readonly: Boolean,
    onUpdate: Function,
  },
  setup(props) {
    const state = reactive({
      editing: !props.content,
      editor: new Editor({
        extensions: [
          new Bold(),
          new BulletList(),
          new HardBreak(),
          new Heading({ levels: [2] }),
          new History(),
          new Italic(),
          new Link(),
          new ListItem(),
          new OnEscape(() => {
            state.editing = false
            state.editor.blur()
          }),
          new Sub(),
          new Sup(),
          new Underline(),
        ],
        content: props.content ? JSON.parse(props.content) : null,
        editable: !props.readonly,
        onFocus() {
          if (!props.readonly) {
            state.editing = true
          }
        },
      }),
    })

    const { editor } = state

    if (props.onUpdate) {
      editor.on('update', debounce(() => props.onUpdate(JSON.stringify(editor.getJSON())), 500))
    }

    const handleEditorClick = (e: Event) => {
      e.stopPropagation()
      if (!props.readonly && !state.editing) {
        state.editing = true
        editor.focus()
      }
    }

    const onOutclick = () => { state.editing = false }

    onMounted(() => {
      document.body.addEventListener('click', onOutclick)
    })

    onBeforeUnmount(() => {
      editor.destroy()
      document.body.removeEventListener('click', onOutclick)
    })

    return () => (
      <section class="sm-RichText" onClick={handleEditorClick}>
        {!props.readonly && (
          <header class="flex items-baseline h-8 mb-2">
            <FadeTransition>
              {state.editing
                ? <MenuBar editor={editor} />
                : <p class="text-sm italic text-gray-700 px-4 leading-6">
                  <i class="el-icon-edit" /> click to edit
                </p>}
            </FadeTransition>
          </header>
        )}
        <EditorContent
          class={[
            'p-4 transition-colors ease-in-out duration-300 rounded',
            { 'bg-transparent': !state.editing },
            { 'bg-gray-200': state.editing },
          ]}
          editor={editor}
        />
      </section>
    )
  },
})

export default RichText
