import DefaultTheme from 'vitepress/theme'
import type { EnhanceAppContext } from 'vitepress'
import './custom.css'
import YouTubeEmbed from './components/YouTubeEmbed.vue'
import SideBySide from './components/SideBySide.vue'
import { createDocsAnalytics } from './analytics'

declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

// Sends through the gtag queue installed by config.mts (head). If analytics
// is not configured for this environment the queue is never consumed, so
// these calls are harmless no-ops.
const gtag = function () {
  if (typeof window === 'undefined') {
    return
  }
  window.dataLayer = window.dataLayer || []
  // gtag.js expects the `arguments` object itself, not an array.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments)
}

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router, siteData }: EnhanceAppContext) {
    app.component('YouTubeEmbed', YouTubeEmbed)
    app.component('SideBySide', SideBySide)

    if (typeof window === 'undefined') {
      return // SSR build
    }

    const analytics = createDocsAnalytics(gtag, new URL(siteData.value.base, window.location.origin).href)

    // Client-side navigations inside the docs (the initial load is sent by the
    // gtag config call in the head). Deferred one tick so document.title has
    // been updated for the new page.
    router.onAfterRouteChanged = () => {
      setTimeout(() => {
        analytics.onRouteChanged(window.location.pathname + window.location.search, document.title)
      }, 0)
    }

    // Links that leave the docs for the app (/pro, /upload, /contact, ...) are
    // the hand-off into the sales funnel; measure them before the browser follows.
    document.addEventListener('click', (event) => {
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link) {
        return
      }
      analytics.onLinkClick(link.getAttribute('href') || '', link.textContent?.trim() || '', window.location.pathname)
    })
  },
}
