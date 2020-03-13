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
            'absolute bg-white rounded p-1 border border-solid border-gray-300 shadow mb-2 transform -translate-x-1/2',
            'transition-fade ease-in-out duration-150',
            { 'invisible opacity-0': !parent.menu.isActive },
            { 'visible opacity-100': parent.menu.isActive },
          ]}
          style={`transform-property: opacity, visibility; left: ${parent.menu.left}px; bottom: ${parent.menu.bottom}px`}
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

const RichText = createComponent<Props>({
  props: {
    content: String,
    onUpdate: Function,
  },
  setup(props, { emit, attrs }) {
    const state = reactive({
      editor: useEditor({
        content: props.content,
        onUpdate: (content) => emit('update', content),
      }),
    })

    const { editor } = state

    editor.on('blur', () => { editor.editing = false })

    return () => (
      <section
        class={[
          'sm-RichText relative rounded border border-solid cursor-text transition-colors ease-in-out duration-150',
          { 'border-gray-400 hover:border-gray-500': !editor.editing },
          { 'border-blue-600': editor.editing },
        ]}
        onClick={(e: Event) => {
          e.stopPropagation()
          if (!editor.focused) editor.focus()
        }}
      >
        <EditorContent
          id={attrs.id}
          class="p-4 h-full box-border overflow-y-auto"
          editor={editor}
        />
        <EditorMenuBubble editor={editor} >
          <MenuElement>
            <MenuItems editor={editor} />
          </MenuElement>
        </EditorMenuBubble>
      </section>
    )
  },
})

export default RichText
