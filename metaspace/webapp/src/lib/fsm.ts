import { ref, Ref, computed } from '@vue/composition-api'
import { connectViaExtension, extractState } from 'remotedev'

export interface State {
  name: string
  context?: any
}

export interface Action {
  type: string
  payload?: any
}

export type Reducer = (state: State, action: Action) => State
export type Dispatch = (action: Action) => void

type Selector<T> = (state: State) => T

type Machine = {
  state: Ref<State>
  dispatch: Dispatch
  select: (selector: Selector<any>) => Ref<any>
}

const machines: Record<string, Machine> = {}

const remotedev = connectViaExtension()

remotedev.subscribe((message: any) => {
  if (message.type === 'ACTION') {
    for (const { dispatch } of Object.values(machines)) {
      try {
        dispatch(JSON.parse(message.payload))
      } catch (_) {
        // do nothing
      }
    }
  } else {
    const state: Record<string, State> = extractState(message)
    if (state) {
      for (const [key, value] of Object.entries(state)) {
        machines[key].state.value = value
      }
    }
  }
})

function updateRemoteDev(action: Action) {
  const nextState: Record<string, State> = {}
  for (const [key, { state }] of Object.entries(machines)) {
    nextState[key] = state.value
  }
  remotedev.send(action, nextState)
}

type FiniteStates = Record<string, Reducer>

export function createReducer(states: FiniteStates) {
  return (state: State, action: Action) => {
    if (state.name in states) {
      return states[state.name](state, action)
    }
    throw new Error(`[fsm] No reducer for state: ${state.name}`)
  }
}

function createSelectFn(state: Ref<State>) {
  return (selector: Selector<any>) => computed(() => selector(state.value))
}

export const register = (key: string, states: FiniteStates, initialState: State): void => {
  if (key in machines) {
    throw new Error(`[fsm] Already registered: ${key}`)
  }

  const state = ref(initialState)
  const reducer = createReducer(states)
  const dispatch = (action: Action) => {
    state.value = reducer(state.value, action)
    updateRemoteDev(action)
  }

  machines[key] = { state, dispatch, select: createSelectFn(state) }

  updateRemoteDev({ type: `[${key}]` })
}

export function useMachine(key: string): Machine {
  if (key in machines) {
    return machines[key]
  }
  throw new Error(`[fsm] Not registered: ${key}`)
}
