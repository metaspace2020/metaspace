import { reactive, toRefs } from '@vue/composition-api'

export type MenuStates = 'NONE' | 'ION' | 'OPTICAL'
export type ViewerModes = 'SINGLE' | 'MULTI'

const state = reactive({
  menu: 'ION',
  mode: 'SINGLE',
})

export function setMenu(name: MenuStates) {
  if (state.menu === name) {
    state.menu = 'NONE'
  } else {
    state.menu = name
  }
}

export function toggleMode() {
  state.mode = (state.mode === 'SINGLE' ? 'MULTI' : 'SINGLE')
}

export default toRefs(state)
