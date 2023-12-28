import {defineComponent, toRefs, watch} from 'vue'
import { ElInput } from 'element-plus'

import * as Form from '../../components/Form'
import { PROJECT_URL_PREFIX } from '../../router'

const ShortLinkField = defineComponent({
  inheritAttrs: false,
  props: {
    error: String,
    label: { type: String, default: 'Short link' },
    modelValue: String,
    id: String,
    disabled: Boolean,
  },
  setup(props , { attrs, emit }) {
    const onInput = (value: string) => {
      emit('update:modelValue', value);
    };

    return () => (
      <div>
        <label for={props.id}>
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
        <ElInput
          class={{ 'sm-form-error': props.error }}
          disabled={props.disabled}
          id={props.id} // @ts-ignore
          maxlength="50"
          minlength="4"
          onUpdate:modelValue={onInput}
          pattern="[a-zA-Z0-9_-]+"
          title="min. 4 characters, a–z, 0–9, hyphen or underscore"
          modelValue={props.modelValue}
          v-slots={{ prepend: () => <span>{PROJECT_URL_PREFIX}</span>}}
        />
      </div>
    )
  },
})

export default ShortLinkField
