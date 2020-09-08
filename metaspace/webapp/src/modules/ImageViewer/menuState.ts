import { ref } from '@vue/composition-api'

export type MenuStates = 'NONE' | 'ION' | 'OPTICAL'

const state = ref<MenuStates>('NONE')

export function setMenu(name: MenuStates) {
  if (state.value === name) {
    state.value = 'NONE'
  } else {
    state.value = name
  }
}

export default state
