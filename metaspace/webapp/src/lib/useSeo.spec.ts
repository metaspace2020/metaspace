import { describe, it, expect, vi, afterEach } from 'vitest'
import { getSeoMetaForRoute } from './useSeo'

const metaOf = (head: any, key: string) => head.meta.find((m: any) => m.name === key || m.property === key)?.content

describe('getSeoMetaForRoute', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lets search engines index the Pro landing page with its own title and description', () => {
    const head = getSeoMetaForRoute({ name: 'pro', path: '/pro' })
    expect(metaOf(head, 'robots')).toBe('index, follow')
    expect(head.title).toContain('Pro')
    expect(metaOf(head, 'description')).toMatch(/private dataset/i)
  })

  it('keeps unknown routes out of the index', () => {
    const head = getSeoMetaForRoute({ name: 'edit-metadata', path: '/edit' })
    expect(metaOf(head, 'robots')).toBe('noindex, nofollow')
  })

  it('emits a canonical link and og:url for the route on the production host', () => {
    const head = getSeoMetaForRoute({ name: 'pro', path: '/pro' })
    expect(head.link).toContainEqual({ rel: 'canonical', href: 'https://metaspace2020.org/pro' })
    expect(metaOf(head, 'og:url')).toBe('https://metaspace2020.org/pro')
  })

  it('mirrors the description into og:description and marks the page as a website', () => {
    const head = getSeoMetaForRoute({ name: 'home', path: '/' })
    expect(metaOf(head, 'og:description')).toBe(metaOf(head, 'description'))
    expect(metaOf(head, 'og:type')).toBe('website')
  })

  it('indexes the dataset list under the name the router actually gives it', () => {
    // The router calls this route 'dataset-list'. It was matched here as
    // 'datasets' for a while, which quietly left /datasets on the noindex
    // default - the one branch a typo can turn into a site-wide loss.
    const head = getSeoMetaForRoute({ name: 'dataset-list', path: '/datasets' })
    expect(metaOf(head, 'robots')).toBe('index, follow')
    expect(head.title).toBe('METASPACE - Datasets')
  })

  it('keeps a staging deployment out of the index', () => {
    // The browser reports the host it is on; the prerenderer, which has no
    // window, gets it from config.siteHostname. Both must reach the same
    // verdict or staging ships static HTML claiming to be indexable.
    vi.stubGlobal('window', { location: { hostname: 'staging.metaspace2020.org' } })
    const head = getSeoMetaForRoute({ name: 'pro', path: '/pro' })
    expect(metaOf(head, 'robots')).toBe('noindex, nofollow')
  })

  it('still points staging canonicals at production, so any stray index consolidates', () => {
    vi.stubGlobal('window', { location: { hostname: 'staging.metaspace2020.org' } })
    const head = getSeoMetaForRoute({ name: 'pro', path: '/pro' })
    expect(head.link).toContainEqual({ rel: 'canonical', href: 'https://metaspace2020.org/pro' })
  })

  it('indexes the FAQ and contact pages, which feed the sales funnel', () => {
    expect(metaOf(getSeoMetaForRoute({ name: 'faq', path: '/faq' }), 'robots')).toBe('index, follow')
    expect(metaOf(getSeoMetaForRoute({ name: 'contact', path: '/contact' }), 'robots')).toBe('index, follow')
  })
})
