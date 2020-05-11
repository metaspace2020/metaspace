import { createComponent } from '@vue/composition-api'
import { Input } from 'element-ui'

import router from '../../router'

const ShortLinkField = createComponent({
  inheritAttrs: false,
  props: {
    hasError: Boolean,
    value: String,
  },
  setup(props, { attrs, listeners }) {
    const { href } = router.resolve({ name: 'project', params: { projectIdOrSlug: 'REMOVE' } }, undefined, true)
    const projectUrlPrefix = location.origin + href.replace('REMOVE', '')

    return () => (
      <Input
        class={{ 'sm-form-error': props.hasError }}
        disabled={attrs.disabled}
        id={attrs.id}
        maxlength="50"
        minlength="4"
        onInput={listeners.input}
        pattern="[a-zA-Z0-9_-]+"
        title="a-z, 0-9, hyphen or underscore"
        value={props.value}
      >
        <span slot="prepend">{projectUrlPrefix}</span>
      </Input>
    )
  },
})

export default ShortLinkField
