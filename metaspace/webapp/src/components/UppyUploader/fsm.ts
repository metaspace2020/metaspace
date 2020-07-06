import { ref, Ref } from '@vue/composition-api'

export interface State {
  type: string
  context: object
}

export interface Action {
  type: string
  payload?: object
}

type Reducer = (state: State, action: Action) => State
type Dispatch = (action: Action) => void

const useFSM = (reducer: Reducer, initialState: State): [ Ref<State>, Dispatch ] => {
  const state = ref(initialState)
  const dispatch = (action: Action) => {
    state.value = reducer(state.value, action)
  }
  return [state, dispatch]
}

export default useFSM
