import { defineComponent, computed } from '@vue/composition-api'
import { Input } from '../../lib/element-ui'

import * as Form from '../../components/Form'

export const DOI_ORG_DOMAIN = 'https://doi.org/'

interface Props {
  value: string
}

const DoiField = defineComponent<Props>({
  inheritAttrs: false,
  props: {
    value: String,
  },
  setup(props, { attrs, listeners }) {
    const inputValue = computed(() =>
      props.value
        ? props.value.replace(DOI_ORG_DOMAIN, '')
        : '',
    )

    const onInput = (value: string) => {
      listeners.input(value.length ? `${DOI_ORG_DOMAIN}${value}` : '')
    }

    return () => (
      <div>
        <label for={attrs.id}>
          <Form.PrimaryLabelText>
            Publication DOI
          </Form.PrimaryLabelText>
          <Form.SecondaryLabelText>
            Should link to the published paper
          </Form.SecondaryLabelText>
        </label>
        <Input
          id={attrs.id}
          disabled={attrs.disabled}
          onInput={onInput}
          value={inputValue.value}
        >
          <span slot="prepend">{DOI_ORG_DOMAIN}</span>
          <span slot="append">
            <a
              href={props.value || null}
              target="_blank"
              rel="noopener"
              class="text-inherit"
            >Test link</a>
          </span>
        </Input>
      </div>
    )
  },
})

export default DoiField
