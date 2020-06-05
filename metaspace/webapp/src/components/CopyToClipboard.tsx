import { createComponent, reactive, ref } from '@vue/composition-api'

import { Input } from 'element-ui'

function copyText(text: string | undefined) {
  if (text) {
    if ('clipboard' in navigator) {
      navigator.clipboard.writeText(text)
    } else {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'absolute'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      try {
        el.select()
        document.execCommand('copy')
      } finally {
        document.body.removeChild(el)
      }
    }
  }
}

interface Props {
  value: string
  type: string
}

export default createComponent<Props>({
  props: {
    value: { type: String },
    type: { type: String, default: 'text' },
  },
  setup(props) {
    const state = reactive({
      copied: false,
      focussed: false,
    })

    const input = ref<Input>(null)

    function handleCopy() {
      copyText(props.value)
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
