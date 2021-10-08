// based on https://uppy.io/docs/stores/#Implementing-Stores

import { ref } from '@vue/composition-api'
import { State } from '@uppy/core'

type Listener = (prevState: State, nextState: State, patch: object) => void

export default () => {
  const state = ref<State>({})
  const listeners = new Set<Listener>()

  return {
    getState: () => state.value,
    setState: (patch: object) => {
      const prevState = state.value
      const nextState = { ...prevState, ...patch }

      state.value = nextState

      listeners.forEach(listener => {
        listener(prevState, nextState, patch)
      })
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
