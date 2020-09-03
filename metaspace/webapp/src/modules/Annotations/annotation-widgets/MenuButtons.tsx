import { defineComponent } from '@vue/composition-api'

import { register, useMachine, Reducer } from '../../../lib/fsm'

const reducer: Reducer = (state, action) => {
  return {
    name: action.type,
  }
}

const states = {
  ION: reducer,
  OPTICAL: reducer,
  NONE: reducer,
}

register('menu', states, { name: 'NONE' })

const MenuButtons = defineComponent({
  setup() {
    const [select, dispatch] = useMachine('menu')
    const name = select(state => state.name)
    return () => (
      <div class="flex flex-row-reverse" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <button
          class={{ 'text-primary': name.value === 'ION' }}
          onClick={() => dispatch({ type: 'ION' })}
        >Ion images</button>
        <button
          class={{ 'text-primary': name.value === 'OPTICAL' }}
          onClick={() => dispatch({ type: 'OPTICAL' })}
        >Optical images</button>
      </div>
    )
  },
})

export default MenuButtons
