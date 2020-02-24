import { createComponent, reactive, ref } from '@vue/composition-api'

import { Button, Input, Tooltip } from 'element-ui'

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

export default createComponent({
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
      <Input
        ref={input}
        value={props.value}
        type={state.focussed ? 'text' : props.type}
        onFocus={handleFocus}
        onBlur={handleBlur}
        readonly
      >
        <Tooltip
          slot="append"
          manual
          value={state.copied}
          content="Copied!"
          placement="bottom"
        >
          <Button
            title="Copy to clipboard"
            icon="el-icon-document-copy"
            onClick={handleCopy}
            nativeOnMouseleave={() => { state.copied = false }}
          />
        </Tooltip>
      </Input>
    )
  },
})
