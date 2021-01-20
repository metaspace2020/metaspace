import 'focus-visible'

import Vue from 'vue'

import config, { updateConfigFromQueryString } from './lib/config'
import * as Sentry from '@sentry/browser'
import { Vue as SentryVue } from '@sentry/integrations/dist/vue'

import VueApollo from 'vue-apollo'
import { DefaultApolloClient } from '@vue/apollo-composable'
import apolloClient, { setMaintenanceMessageHandler } from './api/graphqlClient'
import './useCompositionApi' // https://stackoverflow.com/a/61907559

import ElementUI from './lib/element-ui'
import './modules/App/element-overrides.css'
import locale from 'element-ui/lib/locale/lang/en'
import './modules/App/tailwind.scss'

import store from './store'
import router from './router'
import { sync } from 'vuex-router-sync'
import { Route } from 'vue-router'

import App from './modules/App/App.vue'

import VueAnalytics from 'vue-analytics'
import { setErrorNotifier } from './lib/reportError'
import { migrateLocalStorage } from './lib/localStorage'

if (config.sentry != null && config.sentry.dsn !== '') {
  Sentry.init({
    ...config.sentry,
    integrations: [new SentryVue({ Vue, logErrors: true })],
    ignoreErrors: [
      // Ignore ResizeObserver errors - this seems to be a benign issue, but there's not enough detail to track down
      // the root cause, and the error reports are so spammy they can easily blow our monthly quota.
      'ResizeObserver loop completed with undelivered notifications.',
      'ResizeObserver loop limit exceeded',
    ],
  })
}
Vue.use(VueApollo)

const apolloProvider = new VueApollo({
  defaultClient: apolloClient,
  defaultOptions: {
    $query: {
      fetchPolicy: 'network-only',
    },
  } as any,
})
Vue.use(ElementUI, { locale })
sync(store, router)
router.afterEach((to: Route) => {
  store.commit('updateFilterOnNavigate', to)
})

const isProd = process.env.NODE_ENV === 'production'

migrateLocalStorage()

Vue.use(VueAnalytics, {
  id: 'UA-73509518-1',
  router,
  autoTracking: {
    exception: isProd, // disabled in dev because it impairs "break on uncaught exception"
  },
  debug: {
    // enabled: !isProd,
    sendHitTask: isProd,
  },
})

Vue.config.devtools = process.env.NODE_ENV === 'development'
Vue.config.performance = process.env.NODE_ENV === 'development'

const app = new Vue({
  el: '#app',
  render: h => h(App),
  /*
  renderError (h, err) {
    return h('pre', { style: { color: 'red' }}, err.stack)
  },
  */
  store,
  router,
  apolloProvider,
  provide: {
    [DefaultApolloClient]: apolloClient,
  },
})

setErrorNotifier(app.$notify)
setMaintenanceMessageHandler(app.$alert)
updateConfigFromQueryString()
