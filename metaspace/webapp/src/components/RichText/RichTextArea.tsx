import { createComponent, ref } from '@vue/composition-api'
import { EditorContent } from 'tiptap'

import MenuBar from './MenuBar'
import useEditor from './useEditor'

interface Props {
  content: string
  onUpdate: (content: string) => any
}

const RichText = createComponent<Props>({
  props: {
    content: String,
    onUpdate: Function,
  },
  setup(props) {
    const editor = ref(
      useEditor({
        content: props.content,
        onUpdate: props.onUpdate,
      }),
    )

    return () => (
      <section class="sm-RichText sm-RichTextArea relative rounded h-64 border border-gray-300 mt-1 overflow-hidden">
        <EditorContent
          class="p-4 h-full box-border overflow-y-auto"
          editor={editor.value}
        />
        <footer class="absolute bottom-0 left-0 bg-white rounded-tr rounded-bl p-1 border-0 border-t border-r border-solid border-gray-300 flex justify-center shadow">
          <MenuBar editor={editor.value} />
        </footer>
      </section>
    )
  },
})

export default RichText
