import {Route} from 'vue-router';
import * as cookie from 'js-cookie';
import {pick} from 'lodash-es';
import {safeJsonParse} from '../../util';

const STORAGE_KEY = 'signInRedirect';
const DEFAULT_ROUTE = {path:'/datasets'};


export const setSignInReturnUrl = (route: Route) => {
  const val = JSON.stringify(pick(route, ['name','path','hash','query','params']));
  if (typeof window.localStorage != 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, val);
  } else {
    cookie.set(STORAGE_KEY, val);
  }
};

export const redirectAfterSignIn = () => {
  let redirect;
  if ('localStorage' in window) {
    redirect = safeJsonParse(window.localStorage.getItem(STORAGE_KEY));
    window.localStorage.removeItem(STORAGE_KEY);
  }
  if (redirect == null) {
    redirect = safeJsonParse(cookie.get(STORAGE_KEY));
  }
  cookie.remove(STORAGE_KEY);
  return redirect || DEFAULT_ROUTE;
};
