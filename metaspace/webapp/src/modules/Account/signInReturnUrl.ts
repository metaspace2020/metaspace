import { RawLocation, Route } from 'vue-router'
import { pick } from 'lodash-es'
import { getLocalStorage, removeLocalStorage, setLocalStorage } from '../../lib/localStorage'

const STORAGE_KEY = 'signInRedirect'
const DEFAULT_ROUTE = { path: '/datasets' }

export const setSignInReturnUrl = (route: Route) => {
  const val = pick(route, ['name', 'path', 'hash', 'query', 'params'])
  setLocalStorage(STORAGE_KEY, val, true)
}

export const redirectAfterSignIn = (): RawLocation => {
  const redirect = getLocalStorage<RawLocation>(STORAGE_KEY)
  removeLocalStorage(STORAGE_KEY)
  return redirect || DEFAULT_ROUTE
}
