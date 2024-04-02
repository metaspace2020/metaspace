import 'focus-visible'

import { createApp, h } from 'vue'
import { createHead } from '@unhead/vue'

import config, { updateConfigFromQueryString } from './lib/config'
import * as Sentry from '@sentry/vue'

import { DefaultApolloClient } from '@vue/apollo-composable'
import apolloClient, { setMaintenanceMessageHandler } from './api/graphqlClient'

import ElementPlusCustom from './lib/element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import './modules/App/element-overrides.css'
import './modules/App/tailwind.scss'

import App from './modules/App/App.vue'
import store from './store'
import router from './router'

import VueGtag from 'vue-gtag'
import { setErrorNotifier } from './lib/reportError'
import { migrateLocalStorage } from './lib/localStorage'

import { Route } from '@sentry/vue/types/router'

const isProd = process.env.NODE_ENV === 'production'

const app = createApp({
  render: () => h(App),
})
app.provide(DefaultApolloClient, apolloClient)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

if (config.sentry != null && config.sentry.dsn !== '') {
  Sentry.init({
    app,
    ...config.sentry,
    integrations: [
      new Sentry.BrowserTracing({
        routingInstrumentation: Sentry.vueRouterInstrumentation(router),
      }),
      new Sentry.Replay(),
    ],

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,

    // Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
    tracePropagationTargets: ['localhost', /^https:\/\/metaspace2020\.eu/],

    // Capture Replay for 10% of all sessions,
    // plus for 100% of sessions with an error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    ignoreErrors: [
      // Ignore ResizeObserver errors - this seems to be a benign issue, but there's not enough detail to track down
      // the root cause, and the error reports are so spammy they can easily blow our monthly quota.
      'ResizeObserver loop completed with undelivered notifications.',
      'ResizeObserver loop limit exceeded',
    ],
  })
}

migrateLocalStorage()

app.use(router)
app.use(store as any)
app.use(ElementPlusCustom)

router.afterEach((to: Route) => {
  store.commit('updateFilterOnNavigate', to)
})

app.use(
  VueGtag as any,
  {
    config: { id: 'UA-73509518-1' },
    enabled: isProd, // disabled in dev because it impairs "break on uncaught exception"
  },
  router
)

const head = createHead()
app.use(head)

// app.config.devtools = process.env.NODE_ENV === 'development'
// @ts-ignore
app.config.performance = process.env.NODE_ENV === 'development'

app.mount('#app')

setMaintenanceMessageHandler(app.config.globalProperties.$alert)
setErrorNotifier(app.config.globalProperties.$notification)
updateConfigFromQueryString()
