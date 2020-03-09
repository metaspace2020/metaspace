import { createComponent, onBeforeUnmount, watch } from '@vue/composition-api'
import { Editor, EditorContent, EditorMenuBar, EditorMenuBubble } from 'tiptap'
import {
  Heading,
  Bold,
  HardBreak,
  Italic,
  Link,
  Underline,
  History,
} from 'tiptap-extensions'

export default createComponent({
  props: {
    content: Object,
    editable: Boolean,
    withMenuBar: Boolean,
  },
  setup(props) {
    const editor = new Editor({
      extensions: [
        new Bold(),
        new HardBreak(),
        new Heading({ levels: [1, 2, 3] }),
        new History(),
        new Italic(),
        new Link(),
        new Underline(),
      ],
      content: props.content,
      editable: props.editable,
    })

    watch(() => props.editable, () => {
      editor.setOptions({
        editable: props.editable,
      })
      if (props.editable) {
        editor.focus()
      }
    })

    onBeforeUnmount(() => {
      editor.destroy()
    })

    return () => (
      <div class={['sm-RichText', { 'is-editable': props.editable }]}>
        { props.withMenuBar
          && <EditorMenuBar editor={editor}>
            <div class={['sm-RichText-menubar', { 'is-visible': props.editable }]}>
              <button
                class={['sm-RichText-menubar-button', { 'is-active': editor.isActive.bold() }]}
                onClick={editor.commands.bold}
              >
                Bold
              </button>
              <button
                class={['sm-RichText-menubar-button', { 'is-active': editor.isActive.italic() }]}
                onClick={editor.commands.italic}
              >
                Italic
              </button>
            </div>
          </EditorMenuBar> }
        <EditorContent class="editor__content" editor={editor} />
      </div>
      /* <editor-menu-bubble : editor="editor" : keep-in-bounds="keepInBounds" v-slot="{commands, isActive, menu}">
          <div
          class="menububble"
        : class="{'is-active': menu.isActive }"
        :style="`left: ${menu.left}px; bottom: ${menu.bottom}px;`"
        >

        <button
          class="menububble__button"
          : class="{'is-active': isActive.bold() }"
        @click="commands.bold"
      >
          <icon name="bold" />
        </button>

      <button
        class="menububble__button"
          : class="{ 'is-active': isActive.italic() }"
          @click="commands.italic"
      >
      <icon name="italic" />
        </button >

      <button
        class="menububble__button"
          : class="{ 'is-active': isActive.code() }"
          @click="commands.code"
      >
      <icon name="code" />
        </button >

      </div >
    </editor - menu - bubble >

      <editor-content class="editor__content" : editor="editor" />
  </div > */
    )
  },
})
