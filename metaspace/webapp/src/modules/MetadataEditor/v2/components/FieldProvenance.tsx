import { defineComponent, PropType } from 'vue'
import { FieldState } from '../types'
import './fields.scss'

const PROVENANCE_WORDS: Record<FieldState, string> = {
  migrated: 'migrated',
  'required-empty': 'required, empty',
  new: 'new in v2',
  empty: '',
}

export const FieldProvenance = defineComponent({
  name: 'FieldProvenance',
  props: {
    state: { type: String as PropType<FieldState>, required: true },
  },
  setup(props) {
    return () => {
      const word = PROVENANCE_WORDS[props.state]
      if (!word) {
        return null
      }
      return (
        <span class={['v2-prov', `v2-prov--${props.state}`]}>
          <i class="v2-dot" aria-hidden="true" />
          {word}
        </span>
      )
    }
  },
})
