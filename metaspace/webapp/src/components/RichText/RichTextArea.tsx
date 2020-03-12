import { createComponent, ref } from '@vue/composition-api'
import { EditorContent, EditorMenuBubble } from 'tiptap'

import MenuItems from './MenuItems'
import useEditor from './useEditor'

interface Props {
  content: string
  onUpdate: (content: string) => any
}

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

const RichText = createComponent<Props>({
  props: {
    content: String,
    onUpdate: Function,
  },
  setup(props) {
    const editorRef = ref(
      useEditor({
        content: props.content,
        onUpdate: props.onUpdate,
      }),
    )

    const editor = editorRef.value

    return () => (
      <section class="sm-RichText sm-RichTextArea relative rounded h-64 border border-gray-300 mt-1">
        <EditorContent
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
