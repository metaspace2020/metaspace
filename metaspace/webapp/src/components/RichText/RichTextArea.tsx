import { createComponent, reactive } from '@vue/composition-api'
import { EditorContent, EditorMenuBubble } from 'tiptap'

import MenuItems from './MenuItems'
import useEditor from './useEditor'

const MenuElement = createComponent({
  setup(_, { slots, parent }: any) {
    return () =>
      parent && parent.menu ? (
        <div
          class={[
            'absolute bg-white rounded p-1 border border-solid border-gray-100 shadow mb-2 transform -translate-x-1/2',
            'transition-fade ease-in-out duration-150',
            { 'invisible opacity-0': !parent.menu.isActive },
            { 'visible opacity-100': parent.menu.isActive },
          ]}
          style={`left: ${parent.menu.left}px; bottom: ${parent.menu.bottom}px`}
        >
          {slots.default()}
        </div>
      ) : <div />
  },
})

interface Props {
  content: string
  editorClass: string,
  label: string
  onUpdate: (content: string) => any
}

const RichText = createComponent<Props>({
  props: {
    content: String,
    editorClass: String,
    label: String,
    onUpdate: Function,
  },
  setup(props, { emit }) {
    const state = reactive({
      editor: useEditor({
        content: props.content,
        onUpdate: (content) => emit('update', content),
      }),
    })

    const { editor } = state

    return () => (
      <div class="sm-RichText sm-RichTextArea relative">
        {props.label && <label onClick={() => { editor.focus() }}>{props.label}</label>}
        <EditorContent
          class={[
            'flex-grow w-full box-border overflow-y-auto cursor-text text-gray-700 text-sm',
            'rounded border border-solid transition-colors ease-in-out duration-150',
            'border-gray-300 hover:border-gray-400 focus-within:border-blue-500',
            props.editorClass,
          ]}
          editor={editor}
        />
        <EditorMenuBubble editor={editor} >
          <MenuElement>
            <MenuItems editor={editor} />
          </MenuElement>
        </EditorMenuBubble>
      </div>
    )
  },
})

export default RichText
