import { defineComponent } from '@vue/composition-api'
import FadeTransition from '../FadeTransition'

import SecondaryIcon from '../SecondaryIcon.vue'
import CheckSvg from '../../assets/inline/refactoring-ui/icon-check.svg'

const RadioButton = defineComponent({
  name: 'RadioButton',
  inheritAttrs: false,
  props: {
    checked: Boolean,
    name: String,
  },
  setup(props, { emit, slots, attrs }) {
    return () => (
      <div class="flex -ml-12">
        <div class="w-9 flex items-center">
          <FadeTransition>
            {props.checked && <SecondaryIcon><CheckSvg /></SecondaryIcon>}
          </FadeTransition>
        </div>
        <label
          class={[
            'cursor-pointer p-3 rounded transition-colors ease-in-out duration-300',
            'box-border border border-solid border-transparent',
            'hover:text-body focus-within:border-primary',
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
