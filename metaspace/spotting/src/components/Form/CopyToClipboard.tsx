import { defineComponent, reactive, ref } from '@vue/composition-api'
import { Input } from '../../lib/element-ui'

import copyToClipboard from '../../lib/copyToClipboard'

interface Props {
  value: string
  type: string
}

export default defineComponent<Props>({
  props: {
    value: { type: String },
    type: { type: String, default: 'text' },
  },
  setup(props) {
    const state = reactive({
      copied: false,
      focussed: false,
    })

    const input = ref<Input | null>(null)

    function handleCopy() {
      copyToClipboard(props.value)
      state.copied = true
    }

    function handleFocus() {
      input.value!.select()
      state.focussed = true
    }

    function handleBlur() {
      state.focussed = false
    }

    return () => (
      <el-input
        ref={input}
        value={props.value}
        type={state.focussed ? 'text' : props.type}
        onFocus={handleFocus}
        onBlur={handleBlur}
        readonly
      >
        <el-tooltip
          slot="append"
          manual
          value={state.copied}
          content="Copied!"
          placement="right"
        >
          <el-button
            title="Copy to clipboard"
            icon="el-icon-document-copy"
            onClick={handleCopy}
            nativeOnMouseleave={() => { state.copied = false }}
          />
        </el-tooltip>
      </el-input>
    )
  },
})
