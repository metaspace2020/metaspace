import { reactive, toRefs } from '@vue/composition-api'

export type MenuStates = 'NONE' | 'ION' | 'OPTICAL'
export type ViewerModes = 'SINGLE' | 'MULTI'

const state = reactive({
  menu: 'ION',
  mode: 'SINGLE',
  imagePosition: {
    zoom: 1,
    xOffset: 0,
    yOffset: 0,
  },
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

export function exportImageViewerState() {
  return state
}

export function restoreImageViewerState(imported: any) {
  Object.assign(state, imported.snapshot)
}

export function resetImageViewerState() {
  state.mode = 'SINGLE'
  state.imagePosition = {
    zoom: 1,
    xOffset: 0,
    yOffset: 0,
  }
}

export default toRefs(state)
