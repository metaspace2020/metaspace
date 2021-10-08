import { defineComponent } from '@vue/composition-api'
import { Input } from '../../lib/element-ui'

import * as Form from '../../components/Form'
import { PROJECT_URL_PREFIX } from '../../router'

interface Props {
  error: string
  label: string
  value: string
}

const ShortLinkField = defineComponent<Props>({
  inheritAttrs: false,
  props: {
    error: String,
    label: { type: String, default: 'Short link' },
    value: String,
  },
  setup(props, { attrs, listeners }) {
    return () => (
      <div>
        <label for={attrs.id}>
          <Form.PrimaryLabelText>
            { props.label }
          </Form.PrimaryLabelText>
          <Form.SecondaryLabelText>
            Must be unique, min. 4 characters, using a&ndash;z, 0&ndash;9, hyphen or underscore
          </Form.SecondaryLabelText>
          { props.error
            && <Form.ErrorLabelText>
              { props.error }
            </Form.ErrorLabelText> }
        </label>
        <Input
          class={{ 'sm-form-error': props.error }}
          disabled={attrs.disabled}
          id={attrs.id}
          maxlength="50"
          minlength="4"
          onInput={listeners.input}
          pattern="[a-zA-Z0-9_-]+"
          title="min. 4 characters, a–z, 0–9, hyphen or underscore"
          value={props.value}
        >
          <span slot="prepend">{PROJECT_URL_PREFIX}</span>
        </Input>
      </div>
    )
  },
})

export default ShortLinkField
