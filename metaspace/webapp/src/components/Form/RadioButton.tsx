import { defineComponent } from '@vue/composition-api'
import FadeTransition from '../FadeTransition'

import '../MiniIcon.css'
import CheckIcon from '../../assets/inline/refactoring-ui/check.svg'

const RadioButton = defineComponent({
  name: 'RadioButton',
  inheritAttrs: false,
  props: {
    checked: Boolean,
    name: String,
  },
  setup(props, { emit, slots, attrs }) {
    return () => (
      <div class="flex">
        <div class="w-18 flex items-center justify-center">
          <FadeTransition>
            {props.checked && <CheckIcon class="sm-mini-icon" />}
          </FadeTransition>
        </div>
        <label
          class={[
            'cursor-pointer p-3 rounded transition-colors ease-in-out duration-300',
            'box-border outline-none border border-solid border-transparent',
            'hover:text-body focus-within:border-blue-500',
            { 'text-gray-700': !props.checked, 'bg-gray-100': props.checked },
          ]}
        >
          <input
            class="sr-only"
            type="radio"
            id={attrs.id}
            name={props.name}
            checked={props.checked}
            onChange={() => { emit('change') }}
          />
          {slots.default()}
        </label>
      </div>
    )
  },
})

export default RadioButton
