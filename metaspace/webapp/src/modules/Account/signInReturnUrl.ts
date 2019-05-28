import {Route} from 'vue-router';
import {pick} from 'lodash-es';
import {getLocalStorage, removeLocalStorage, setLocalStorage} from '../../lib/localStorage';

const STORAGE_KEY = 'signInRedirect';
const DEFAULT_ROUTE = {path:'/datasets'};


export const setSignInReturnUrl = (route: Route) => {
  const val = JSON.stringify(pick(route, ['name','path','hash','query','params']));
  setLocalStorage(STORAGE_KEY, val, true);
};

export const redirectAfterSignIn = () => {
  let redirect = getLocalStorage(STORAGE_KEY);
  removeLocalStorage(STORAGE_KEY);
  return redirect || DEFAULT_ROUTE;
};
