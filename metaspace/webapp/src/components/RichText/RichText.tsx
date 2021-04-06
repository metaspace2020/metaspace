import { defineComponent, reactive, onMounted, onBeforeUnmount } from '@vue/composition-api'
import { EditorContent, EditorMenuBar } from 'tiptap'
import { Placeholder } from 'tiptap-extensions'

import FadeTransition from '../../components/FadeTransition'
import MenuItems from './MenuItems'

import useEditor from './useEditor'
import { OnEscape } from './tiptap'

interface Props {
  content: string
  placeholder: string
  contentClassName: string
  readonly: boolean
  autoFocus: boolean
  hideStateStatus: boolean
  update: (content: string) => Promise<void> | void
}

const saveStates = {
  UNSAVED: 'UNSAVED',
  SAVING: 'SAVING',
  SAVED: 'SAVED',
  FAILED: 'FAILED',
}

const getSaveState = (saveState: string) => {
  switch (saveState) {
    case saveStates.SAVING:
      return 'saving…'
    case saveStates.SAVED:
      return 'saved.'
    default:
      return ''
  }
}

const RichText = defineComponent<Props>({
  props: {
    content: String,
    placeholder: String,
    contentClassName: String,
    readonly: Boolean,
    hideStateStatus: Boolean,
    update: Function,
    autoFocus: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const state = reactive({
      editor: useEditor({
        extensions: [
          new OnEscape(() => {
            state.editing = false
            state.editor.blur()
          }),
        ].concat(
          props.placeholder ? new Placeholder({
            emptyNodeText: props.placeholder,
            emptyNodeClass: 'sm-RichText-placeholder',
            showOnlyWhenEditable: false,
          }) : [],
        ),
        editable: !props.readonly,
        content: props.content,
        onUpdate: async(content: string) => {
          state.saveState = saveStates.SAVING
          try {
            // wait a minimum of 500ms for the transition
            await Promise.all([
              props.update(content),
              new Promise(resolve => setTimeout(resolve, 500)),
            ])
            state.saveState = saveStates.SAVED
          } catch (e) {
            console.error(e)
            state.saveState = saveStates.FAILED
          }
        },
      }),
      editing: props.autoFocus,
      saveState: saveStates.UNSAVED,
    })

    const { editor } = state

    if (!props.readonly) {
      editor.on('focus', () => { state.editing = true })

      const onOutclick = () => {
        state.editing = false
        state.saveState = saveStates.UNSAVED
      }

      onMounted(() => {
        document.body.addEventListener('click', onOutclick)
      })

      onBeforeUnmount(() => {
        document.body.removeEventListener('click', onOutclick)
      })
    }

    const stopPropagation = (e: Event) => { e.stopPropagation() }

    const handleEditorClick = (e: Event) => {
      e.stopPropagation()
      if (!props.readonly && !state.editing) {
        editor.focus()
      }
    }

    return () => (
      <section class="sm-RichText">
        {!props.readonly && (
          <header class="flex items-end h-8 mb-1">
            <FadeTransition>
              {state.editing
                ? <div onClick={stopPropagation}>
                  <EditorMenuBar editor={editor}>
                    <MenuItems editor={editor} />
                  </EditorMenuBar>
                </div>
                : <button
                  onClick={handleEditorClick}
                  class="button-reset text-sm italic text-gray-700 px-4 leading-6"
                >
                  <i class="el-icon-edit" /> click to edit
                </button>}
            </FadeTransition>
            {
              !props.hideStateStatus
              && <FadeTransition>
                {state.editing && <p class="m-0 ml-auto text-sm leading-6 text-gray-700" onClick={stopPropagation}>
                  <FadeTransition>
                    {state.saveState === saveStates.FAILED
                      ? <button class="el-button el-button--mini" onClick={() => editor.emitUpdate()}>
                        Retry
                      </button>
                      : <span key={state.saveState}>
                        {getSaveState(state.saveState)}
                      </span>}
                  </FadeTransition>
                </p> }
              </FadeTransition>
            }
          </header>
        )}
        <div onClick={stopPropagation}>
          <EditorContent
            autoFocus={props.autoFocus}
            class={[
              props.contentClassName,
              'transition-colors ease-in-out duration-300 rounded',
              { 'bg-transparent': !state.editing },
              { 'bg-gray-100': state.editing },
            ]}
            editor={editor}
          />
        </div>
      </section>
    )
  },
})

export default RichText
