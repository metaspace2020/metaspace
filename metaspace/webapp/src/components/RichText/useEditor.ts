import { ref, onBeforeUnmount } from 'vue'
import { Editor } from '@tiptap/vue-3'
// @ts-ignore
import StarterKit from '@tiptap/starter-kit'
import { debounce } from 'lodash-es'

interface Options {
  content?: string
  extensions?: object[]
  onUpdate?: (...args: any[]) => any
}

export default function useEditor({ content, extensions = [], onUpdate, ...options }: Options) {
  const editor = ref<any>(
    new Editor({
      extensions: [
        StarterKit, // @ts-ignore
        ...extensions,
      ],
      ...options,
      content: content ? JSON.parse(content) : null,
    })
  )

  if (onUpdate) {
    editor.value.on(
      'update',
      debounce(() => {
        const doc = editor.value.getJSON()
        if (doc.content.length === 1 && doc.content[0].content === undefined) {
          onUpdate(null)
        } else {
          onUpdate(JSON.stringify(doc))
        }
      }, 500)
    )
  }

  onBeforeUnmount(() => {
    editor.value.destroy()
  })

  return editor.value
}
