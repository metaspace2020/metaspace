import { defineComponent, reactive, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorContent } from '@tiptap/vue-3'
import { useEditor } from '@tiptap/vue-3'
import Placeholder from '@tiptap/extension-placeholder'
import { OnEscape } from './tiptap'
import StarterKit from '@tiptap/starter-kit'
import TextStyle from '@tiptap/extension-text-style'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import FadeTransition from '../../components/FadeTransition'
import MenuItems from './MenuItems'
import './RichText.css'
import safeJsonParse from '../../lib/safeJsonParse'
import { ElIcon } from '../../lib/element-plus'
import { EditPen } from '@element-plus/icons-vue'

interface Props {
  content: string
  placeholder: string
  contentClassName: string
  readonly: boolean
  autoFocus: boolean
  alwaysEditing: boolean
  hideStateStatus: boolean
  maxCharacters?: number
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

const Underline = TextStyle.extend({
  name: 'underline',
  parseHTML() {
    return [{ tag: 'u' }, { style: 'text-decoration', getAttrs: (value) => value === 'underline' && null }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['u', HTMLAttributes, 0]
  }, // @ts-ignore
  addCommands() {
    return {
      setUnderline:
        () =>
        ({ commands }) => {
          return commands.setMark('underline')
        },
      toggleUnderline:
        () =>
        ({ commands }) => {
          return commands.toggleMark('underline')
        },
      unsetUnderline:
        () =>
        ({ commands }) => {
          return commands.unsetMark('underline')
        },
    }
  },
} as any)

// Utility function to extract plain text from Tiptap JSON
const extractPlainText = (content: any): string => {
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content)
    } catch {
      return content
    }
  }

  if (!content || typeof content !== 'object') {
    return ''
  }

  const extractTextFromNode = (node: any): string => {
    if (node.text) {
      return node.text
    }
    if (node.content && Array.isArray(node.content)) {
      return node.content.map(extractTextFromNode).join('')
    }
    return ''
  }

  return extractTextFromNode(content)
}

const RichText = defineComponent({
  props: {
    content: String,
    placeholder: String,
    contentClassName: String,
    readonly: Boolean,
    hideStateStatus: Boolean,
    alwaysEditing: Boolean,
    maxCharacters: Number,
    update: Function,
    autoFocus: {
      type: Boolean,
      default: false,
    },
  },
  setup(props: Props | any) {
    const state = reactive<any>({
      editor: useEditor({
        extensions: [
          StarterKit,
          Underline,
          Subscript,
          Superscript,
          new OnEscape(() => {
            if (!props.alwaysEditing) {
              state.editing = false
            }
            state.editor.commands.blur()
          }),
          Placeholder.configure({
            placeholder: props.placeholder,
            emptyNodeClass: 'sm-RichText-placeholder',
            showOnlyWhenEditable: false,
          }),
        ],
        editable: !props.readonly,
        content: safeJsonParse(props.content),
        onUpdate: async ({ editor }) => {
          const editorJSON = editor.getJSON()
          const content = JSON.stringify(editorJSON)

          // Check character limit if specified
          if (props.maxCharacters) {
            const plainText = extractPlainText(editorJSON)
            if (plainText.length > props.maxCharacters) {
              // Prevent the update by reverting to previous content
              editor.commands.setContent(safeJsonParse(props.content))
              return
            }
          }

          state.saveState = saveStates.SAVING
          try {
            // wait a minimum of 500ms for the transition
            await Promise.all([props.update(content), new Promise((resolve) => setTimeout(resolve, 500))])
            state.saveState = saveStates.SAVED
          } catch (e) {
            console.error(e)
            state.saveState = saveStates.FAILED
          }
        },
      }),
      editing: props.autoFocus || props.alwaysEditing,
      saveState: saveStates.UNSAVED,
    })

    watch(
      () => props.content,
      (newContent) => {
        if (!newContent) return
        state.editor?.commands?.setContent(safeJsonParse(newContent))
      }
    )

    if (!props.readonly) {
      state.editor?.on('focus', () => {
        state.editing = true
      })

      const onOutclick = () => {
        if (!props.alwaysEditing) {
          state.editing = false
        }
        state.saveState = saveStates.UNSAVED
      }

      onMounted(() => {
        document.body.addEventListener('click', onOutclick)
      })

      onBeforeUnmount(() => {
        document.body.removeEventListener('click', onOutclick)
      })
    }

    const stopPropagation = (e: Event) => {
      e.stopPropagation()
    }

    const handleEditorClick = (e: Event) => {
      e.stopPropagation()
      if (!props.readonly && !state.editing) {
        state.editor.commands.focus()
        state.editing = true
      }
    }

    return () => (
      <section class="sm-RichText">
        {!props.readonly && (
          <header class="flex items-end h-8 mb-1">
            <FadeTransition>
              {state.editing && state.editor ? (
                <div onClick={stopPropagation}>
                  <MenuItems editor={state.editor} />
                </div>
              ) : (
                <button onClick={handleEditorClick} class="button-reset text-sm italic text-gray-700 px-4 leading-6">
                  <ElIcon>
                    <EditPen />
                  </ElIcon>{' '}
                  click to edit
                </button>
              )}
            </FadeTransition>
            {!props.hideStateStatus && (
              <FadeTransition>
                {state.editing && (
                  <p class="m-0 ml-auto text-sm leading-6 text-gray-700" onClick={stopPropagation}>
                    <FadeTransition>
                      {state.saveState === saveStates.FAILED ? (
                        <button class="el-button el-button--mini" onClick={() => state.editor.emitUpdate()}>
                          Retry
                        </button>
                      ) : (
                        <span key={state.saveState}>{getSaveState(state.saveState)}</span>
                      )}
                    </FadeTransition>
                  </p>
                )}
              </FadeTransition>
            )}
          </header>
        )}
        <div onClick={stopPropagation}>
          <EditorContent
            class={[
              props.contentClassName,
              'transition-colors ease-in-out duration-300 rounded',
              { 'bg-transparent': !state.editing },
              { 'bg-gray-100': state.editing },
            ]}
            editor={state.editor}
          />
        </div>
      </section>
    )
  },
})

export default RichText
