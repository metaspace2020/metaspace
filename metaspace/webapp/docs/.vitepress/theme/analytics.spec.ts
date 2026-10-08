import { describe, it, expect, vi } from 'vitest'
import { appLinkDestination, buildDocsPageView, createDocsAnalytics } from './analytics'

describe('appLinkDestination', () => {
  it('returns the app path for a root-relative link into the METASPACE app', () => {
    expect(appLinkDestination('/pro', 'https://metaspace2020.org/docs/')).toBe('/pro')
    expect(appLinkDestination('/upload', 'https://metaspace2020.org/docs/')).toBe('/upload')
  })

  it('returns the app path for an absolute link to the same host', () => {
    expect(appLinkDestination('https://metaspace2020.org/pro#plans', 'https://metaspace2020.org/docs/')).toBe(
      '/pro#plans'
    )
  })

  it('ignores links that stay inside the docs site', () => {
    expect(appLinkDestination('/docs/features/roi', 'https://metaspace2020.org/docs/')).toBeNull()
    expect(appLinkDestination('https://metaspace2020.org/docs/', 'https://metaspace2020.org/docs/')).toBeNull()
  })

  it('ignores external and non-http links', () => {
    expect(appLinkDestination('https://github.com/metaspace2020', 'https://metaspace2020.org/docs/')).toBeNull()
    expect(appLinkDestination('mailto:contact@metaspace2020.org', 'https://metaspace2020.org/docs/')).toBeNull()
    expect(appLinkDestination('#section', 'https://metaspace2020.org/docs/')).toBeNull()
  })
})

describe('buildDocsPageView', () => {
  it('describes a docs page view with the docs-prefixed path and title', () => {
    expect(buildDocsPageView('/docs/features/roi.html', 'ROI selection | METASPACE docs')).toEqual({
      page_path: '/docs/features/roi.html',
      page_title: 'ROI selection | METASPACE docs',
      site_section: 'docs',
    })
  })
})

describe('createDocsAnalytics', () => {
  it('sends a page_view through gtag on each route change', () => {
    const gtag = vi.fn()
    const analytics = createDocsAnalytics(gtag, 'https://metaspace2020.org/docs/')
    analytics.onRouteChanged('/docs/guides/x.html', 'Guide X')
    expect(gtag).toHaveBeenCalledWith('event', 'page_view', {
      page_path: '/docs/guides/x.html',
      page_title: 'Guide X',
      site_section: 'docs',
    })
  })

  it('sends docs_outbound_click when a link into the app is clicked', () => {
    const gtag = vi.fn()
    const analytics = createDocsAnalytics(gtag, 'https://metaspace2020.org/docs/')
    analytics.onLinkClick('/pro#plans', 'Compare plans', '/docs/getting-started/overview.html')
    expect(gtag).toHaveBeenCalledWith('event', 'docs_outbound_click', {
      destination: '/pro#plans',
      link_text: 'Compare plans',
      page_path: '/docs/getting-started/overview.html',
    })
  })

  it('does nothing for a click that stays inside the docs', () => {
    const gtag = vi.fn()
    const analytics = createDocsAnalytics(gtag, 'https://metaspace2020.org/docs/')
    analytics.onLinkClick('/docs/features/roi.html', 'ROI', '/docs/')
    expect(gtag).not.toHaveBeenCalled()
  })
})
