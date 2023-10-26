import 'focus-visible'

import { createApp } from 'vue'
import config from './lib/config'

import * as Sentry from '@sentry/vue'

import ElementPlus from 'element-plus'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import en from 'element-plus/dist/locale/en.mjs'
import 'element-plus/dist/index.css'
import 'tailwindcss/tailwind.css'
import './main.css'

import store from './store'
import router from './router'

import App from './App.vue'

import { sync } from 'vuex-router-sync'

import VueGtag from 'vue-gtag'

sync(store, router)
const isProd = process.env.NODE_ENV === 'production'
const app = createApp(App)

if (config.sentry != null && config.sentry.dsn !== '') {
  Sentry.init({
    app,
    ...config.sentry,
    integrations: [
      new Sentry.BrowserTracing({
        routingInstrumentation: Sentry.vueRouterInstrumentation(router)
      }),
      new Sentry.Replay()
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
      'ResizeObserver loop limit exceeded'
    ]
  })
}

app.use(VueGtag, {
  config: { id: 'UA-73509518-1' },
  enabled: isProd // disabled in dev because it impairs "break on uncaught exception"
}, router)

app.use(store)
app.use(router)
app.use(ElementPlus, {
  locale: en
})

// app.config.devtools = process.env.NODE_ENV === 'development'
app.config.performance = process.env.NODE_ENV === 'development'

app.mount('#app')
