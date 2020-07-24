import Vue from 'vue'

import config, { updateConfigFromQueryString } from './lib/config'
import * as Raven from 'raven-js'
import * as RavenVue from 'raven-js/plugins/vue'

import VueApollo from 'vue-apollo'
import { DefaultApolloClient } from '@vue/apollo-composable'
import apolloClient, { setMaintenanceMessageHandler } from './api/graphqlClient'

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

import VueCompositionApi from '@vue/composition-api'

Vue.use(VueCompositionApi)

if (config.ravenDsn != null && config.ravenDsn !== '') {
  Raven.config(config.ravenDsn)
    .addPlugin(RavenVue, Vue)
    .install()
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
