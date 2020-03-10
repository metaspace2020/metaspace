import { createComponent, onBeforeUnmount, watch, reactive } from '@vue/composition-api'
import { Editor, EditorContent, EditorMenuBar } from 'tiptap'
import {
  Heading,
  Bold,
  HardBreak,
  Italic,
  Link,
  Underline,
  History,
} from 'tiptap-extensions'

const emptyContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
    },
  ],
}

export default createComponent({
  props: {
    content: String,
    readonly: Boolean,
    getContent: Function,
  },
  setup(props) {
    const state = reactive({
      editing: false,
    })

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
      content: props.content ? JSON.parse(props.content) : null,
      editable: !props.readonly,
      onFocus() {
        state.editing = true
      },
      onBlur() {
        state.editing = false
      },
    })

    watch(() => state.editing, () => {
      if (!state.editing && props.getContent) {
        props.getContent(JSON.stringify(editor.getJSON()))
      }
    })

    onBeforeUnmount(() => {
      editor.destroy()
    })

    return () => (
      <div class={['sm-RichText', { 'is-editable': state.editing }]}>
        {!props.readonly && (
          state.editing
            ? <EditorMenuBar editor={editor}>
              <div class={['sm-RichText-menubar', { 'is-visible': state.editing }]}>
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
            </EditorMenuBar>
            : <p><em>Click to edit:</em></p>
        )}
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
