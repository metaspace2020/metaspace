import { createComponent, computed } from '@vue/composition-api'
import { Input } from 'element-ui'

export const DOI_ORG_DOMAIN = 'https://doi.org/'

const DoiField = createComponent({
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
    )
  },
})

export default DoiField
