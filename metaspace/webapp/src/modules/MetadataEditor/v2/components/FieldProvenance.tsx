import { defineComponent, PropType } from 'vue'
import { FieldState } from '../types'
import './fields.scss'

export const PROVENANCE_WORDS: Record<FieldState, string> = {
  migrated: 'migrated',
  review: 'needs review',
  'required-empty': 'required, empty',
  new: 'new in v2',
  copied: 'copied · review',
  empty: '',
}

export const FieldProvenance = defineComponent({
  name: 'FieldProvenance',
  props: {
    state: { type: String as PropType<FieldState>, required: true },
    acknowledged: { type: Boolean, default: false },
  },
  setup(props) {
    return () => {
      const state =
        props.acknowledged && (props.state === 'review' || props.state === 'copied') ? 'migrated' : props.state
      const word = PROVENANCE_WORDS[state]
      if (!word) {
        return null
      }
      return (
        <span class={['v2-prov', `v2-prov--${state}`]}>
          <i class="v2-dot" aria-hidden="true" />
          {word}
        </span>
      )
    }
  },
})
