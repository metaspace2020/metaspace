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

import FadeTransition from '../../components/FadeTransition'

import { Sub, Sup } from './tiptap'

const MenuBarButton = createComponent({
  props: {
    isActive: Boolean,
    onClick: Function,
    title: String,
  },
  setup(props, { slots, listeners }) {
    return () => (
      <button
        class={[
          'button-reset mr-1 px-1 h-8 w-8 inline-flex items-center justify-center rounded-sm hover:bg-gray-200',
          { 'text-gray-600': !props.isActive },
          { 'text-gray-900': props.isActive },
        ]}
        onClick={listeners.click}
        title={props.title}
      >
        {slots.default()}
      </button>
    )
  },
})

export default createComponent({
  props: {
    content: String,
    readonly: Boolean,
    getContent: Function,
  },
  setup(props) {
    const state = reactive({
      editing: true,
      editor: new Editor({
        extensions: [
          new Bold(),
          new HardBreak(),
          new Heading({ levels: [2] }),
          new History(),
          new Italic(),
          new Link(),
          new Underline(),
          new Sub(),
          new Sup(),
        ],
        content: props.content ? JSON.parse(props.content) : null,
        editable: !props.readonly,
        onFocus() {
          state.editing = true
        },
      }),
    })

    const { editor } = state

    watch(() => state.editing, () => {
      if (!state.editing && props.getContent) {
        props.getContent(JSON.stringify(editor.getJSON()))
      }
    })

    onBeforeUnmount(() => {
      editor.destroy()
    })

    return () => (
      <section class={['sm-RichText ', { 'is-editing': state.editing }]}>
        {!props.readonly && (
          <header class="flex items-center h-6 my-4">
            <FadeTransition mode="out-in">
              { state.editing
                ? <EditorMenuBar editor={editor}>
                  <div class="flex items-center w-full">
                    <MenuBarButton
                      isActive={editor.isActive.bold()}
                      onClick={editor.commands.bold}
                      title="Bold"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" class="fill-current"><path d="M0 0h24v24H0V0z" fill="none" /><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H8c-.55 0-1 .45-1 1v12c0 .55.45 1 1 1h5.78c2.07 0 3.96-1.69 3.97-3.77.01-1.53-.85-2.84-2.15-3.44zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" /></svg>
                    </MenuBarButton>
                    <MenuBarButton
                      isActive={editor.isActive.italic()}
                      onClick={editor.commands.italic}
                      title="Italic"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" class="fill-current"><path d="M0 0h24v24H0V0z" fill="none" /><path d="M10 5.5c0 .83.67 1.5 1.5 1.5h.71l-3.42 8H7.5c-.83 0-1.5.67-1.5 1.5S6.67 18 7.5 18h5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5h-.71l3.42-8h1.29c.83 0 1.5-.67 1.5-1.5S17.33 4 16.5 4h-5c-.83 0-1.5.67-1.5 1.5z" /></svg>
                    </MenuBarButton>
                    <MenuBarButton
                      isActive={editor.isActive.heading({ level: 2 })}
                      onClick={() => editor.commands.heading({ level: 2 })}
                      title="Title"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" class="fill-current"><path d="M0 0h24v24H0V0z" fill="none" /><path d="M5 5.5C5 6.33 5.67 7 6.5 7h4v10.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V7h4c.83 0 1.5-.67 1.5-1.5S18.33 4 17.5 4h-11C5.67 4 5 4.67 5 5.5z" /></svg>
                    </MenuBarButton>
                    <MenuBarButton
                      isActive={editor.isActive.underline()}
                      onClick={editor.commands.underline}
                      title="Underline"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" class="fill-current"><path d="M0 0h24v24H0V0z" fill="none" /><path d="M12.79 16.95c3.03-.39 5.21-3.11 5.21-6.16V4.25C18 3.56 17.44 3 16.75 3s-1.25.56-1.25 1.25v6.65c0 1.67-1.13 3.19-2.77 3.52-2.25.47-4.23-1.25-4.23-3.42V4.25C8.5 3.56 7.94 3 7.25 3S6 3.56 6 4.25V11c0 3.57 3.13 6.42 6.79 5.95zM5 20c0 .55.45 1 1 1h12c.55 0 1-.45 1-1s-.45-1-1-1H6c-.55 0-1 .45-1 1z" /></svg>
                    </MenuBarButton>
                    <MenuBarButton
                      isActive={editor.isActive.sub()}
                      onClick={editor.commands.sub}
                      title="Subscript"
                    >
                      <span class="text-lg font-bold tracking-wider">H<sub class="text-xs">2</sub></span>
                    </MenuBarButton>
                    <button
                      class="button-reset text-sm font-bold uppercase py-2 px-4 ml-auto rounded-sm bg-blue-600 text-white hover:opacity-75 tracking-wide"
                      onClick={() => { state.editing = false }}
                    >
                      Save
                    </button>
                  </div>
                </EditorMenuBar>
                : <p class="text-sm italic">Click to edit:</p> }
            </FadeTransition>
          </header>
        )}
        <EditorContent class="outline-none" editor={editor} />
      </section>
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
