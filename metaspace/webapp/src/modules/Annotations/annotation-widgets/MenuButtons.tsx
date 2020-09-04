import { defineComponent } from '@vue/composition-api'

import { register, useMachine, Reducer } from '../../../lib/fsm'

import '../../../components/StatefulIcon.css'
import MonitorIcon from '../../../assets/inline/refactoring-ui/monitor.svg'
import CameraIcon from '../../../assets/inline/refactoring-ui/camera.svg'

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
  name: 'MenuButtons',
  setup() {
    const { select, dispatch } = useMachine('menu')
    const name = select(state => state.name)
    return () => (
      <div class="flex flex-row-reverse" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <button
          class="button-reset flex h-6 mr-3"
          onClick={() => dispatch({ type: 'ION' })}
        >
          <MonitorIcon
            class={['sm-stateful-icon', { 'sm-stateful-icon--active': name.value === 'ION' }]}
          />
        </button>
        <button
          class="button-reset flex h-6 mr-3"
          onClick={() => dispatch({ type: 'OPTICAL' })}
        >
          <CameraIcon
            class={['sm-stateful-icon', { 'sm-stateful-icon--active': name.value === 'OPTICAL' }]}
          />
        </button>
      </div>
    )
  },
})

export default MenuButtons
