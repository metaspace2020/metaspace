import { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { pick } from 'lodash-es'
import { getLocalStorage, removeLocalStorage, setLocalStorage } from '../../lib/localStorage'

const STORAGE_KEY = 'signInRedirect'
const DEFAULT_ROUTE: RouteLocationRaw = { path: '/datasets' }

export const setSignInReturnUrl = (route: RouteLocationNormalized) => {
  // Note: You might need to adjust what properties you pick based on what's available in RouteLocationNormalized
  const val = pick(route, ['name', 'path', 'hash', 'query', 'params'])
  setLocalStorage(STORAGE_KEY, val, true)
}

export const redirectAfterSignIn = (): RouteLocationRaw => {
  const redirect = getLocalStorage<RouteLocationRaw>(STORAGE_KEY)
  removeLocalStorage(STORAGE_KEY)
  return redirect || DEFAULT_ROUTE
}
