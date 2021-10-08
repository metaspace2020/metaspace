import './RichTextArea.css'

import { defineComponent, reactive } from '@vue/composition-api'
import { EditorContent, EditorMenuBubble } from 'tiptap'

import MenuItems from './MenuItems'
import useEditor from './useEditor'

const MenuWrapper = defineComponent({
  name: 'MenuWrapper',
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
          onClick={(e: Event) => { e.preventDefault() /* Prevent form submission */ }}
        >
          {slots.default()}
        </div>
      ) : <div />
  },
})

interface Props {
  content: string
  onUpdate: (content: string) => any
}

const RichTextArea = defineComponent<Props>({
  name: 'RichTextArea',
  props: {
    content: String,
    onUpdate: Function,
  },
  setup(props, { emit, slots }) {
    const state = reactive({
      editor: useEditor({
        content: props.content,
        onUpdate: (content) => emit('update', content),
      }),
    })

    const { editor } = state

    return () => (
      <div class="sm-RichText sm-RichTextArea relative">
        {slots.label && <label onClick={() => { editor.focus() }}>{slots.label()}</label>}
        <EditorContent
          class={[
            'h-40 w-full box-border overflow-y-auto cursor-text text-gray-800 text-sm',
            'rounded border border-solid transition-colors ease-in-out duration-200',
            'border-gray-300 hover:border-gray-500 focus-within:border-primary',
            { 'mt-1': slots.label },
          ]}
          editor={editor}
        />
        <EditorMenuBubble editor={editor} >
          <MenuWrapper>
            <MenuItems editor={editor} />
          </MenuWrapper>
        </EditorMenuBubble>
        <p
          class="sm-RichTextArea-description cursor-help"
          title="Highlight a word or phrase for formatting options"
          onClick={() => { editor.focus() }}
        >
          Rich Text
        </p>
      </div>
    )
  },
})

export default RichTextArea
