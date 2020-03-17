import { onBeforeUnmount, onMounted, ref } from '@vue/composition-api'
import { Editor } from 'tiptap'
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

import { Sub, Sup } from './tiptap'

interface Options {
  [key: string]: any
  content?: string
  extensions?: object[]
  onUpdate?: (...args: any[]) => any
}

export default function({ content, extensions = [], onUpdate, ...options }: Options) {
  const editor = new Editor({
    extensions: [
      new Bold(),
      new BulletList(),
      new HardBreak(),
      new Heading({ levels: [2] }),
      new History(),
      new Italic(),
      new Link(),
      new ListItem(),
      new Sub(),
      new Sup(),
      new Underline(),
      ...extensions,
    ],
    ...options,
    content: content ? JSON.parse(content) : null,
  })

  if (onUpdate) {
    editor.on('update', debounce(() => onUpdate(JSON.stringify(editor.getJSON())), 500))
  }

  onBeforeUnmount(() => {
    editor.destroy()
  })

  return editor
}
