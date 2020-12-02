import { reactive, computed } from '@vue/composition-api'
import { isArray } from 'lodash-es'

import { getLocalStorage, setLocalStorage } from '../lib/localStorage'

const STORAGE_KEY = 'dismissedFeaturePopups'

const NEW_FEATURES = [
  'isomersIsobars',
  'medianCosineColoc',
  'customDatabases',
]

function getDismissedPopups() {
  try {
    const list = getLocalStorage(STORAGE_KEY)
    if (isArray(list)) {
      // Filter out invalid/old entries
      return list.filter(item => NEW_FEATURES.some(f => f === item))
    } else {
      return []
    }
  } catch (ex) {
    return []
  }
}

const previousDismissedPopups = getDismissedPopups()

const state = reactive({
  dismissed: [...previousDismissedPopups],
  queued: [] as string[],
})

const activePopup = computed(() => state.queued[0])

function closeActivePopup() {
  const popup = state.queued.shift()
  state.dismissed.push(popup)
  return popup
}

export default () => {
  return {
    activePopup,
    isDismissed(name: string) {
      return state.dismissed.includes(name)
    },
    queuePopup(name: string) {
      if (state.dismissed.includes(name) || state.queued.includes(name)) {
        return
      }
      state.queued.push(name)
    },
    unqueuePopup(name: string) {
      const index = state.queued.indexOf(name)
      if (index !== -1) {
        state.queued.splice(index, 1)
      }
    },
    remindLater() {
      closeActivePopup()
    },
    dismissPopup() {
      const popup = closeActivePopup()
      previousDismissedPopups.push(popup)
      setLocalStorage(STORAGE_KEY, previousDismissedPopups)
    },
  }
}
