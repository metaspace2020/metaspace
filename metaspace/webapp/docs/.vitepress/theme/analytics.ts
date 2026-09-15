/**
 * Google Analytics for the VitePress docs site.
 *
 * The docs are a separate static site served under /docs, outside the Vue
 * app, so the app's vue-gtag setup never runs here. The tag itself is injected
 * by `.vitepress/config.mts` (head); this module provides the pure, testable
 * logic that the theme wires to VitePress' router and to link clicks.
 *
 * Same origin as the app means the GA client cookie is shared, so a visit that
 * starts in the docs and ends on /pro is measured as one session.
 */

export type Gtag = (...args: any[]) => void

/**
 * Resolve `href` against the docs base and return its app path when it leads
 * out of the docs into the METASPACE app on the same host, else null.
 */
export const appLinkDestination = (href: string, docsBase: string): string | null => {
  if (!href) {
    return null
  }
  let base: URL
  let url: URL
  try {
    base = new URL(docsBase)
    url = new URL(href, base)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null
  }
  if (url.host !== base.host) {
    return null
  }
  if (url.pathname.startsWith(base.pathname)) {
    return null
  }
  return url.pathname + url.search + url.hash
}

export const buildDocsPageView = (pagePath: string, pageTitle: string) => ({
  page_path: pagePath,
  page_title: pageTitle,
  site_section: 'docs',
})

export const createDocsAnalytics = (gtag: Gtag, docsBase: string) => ({
  onRouteChanged(pagePath: string, pageTitle: string) {
    gtag('event', 'page_view', buildDocsPageView(pagePath, pageTitle))
  },
  onLinkClick(href: string, linkText: string, pagePath: string) {
    const destination = appLinkDestination(href, docsBase)
    if (!destination) {
      return
    }
    gtag('event', 'docs_outbound_click', { destination, link_text: linkText, page_path: pagePath })
  },
})
