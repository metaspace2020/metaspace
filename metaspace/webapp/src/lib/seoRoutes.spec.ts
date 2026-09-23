import { describe, it, expect } from 'vitest'
import { SEO_ROUTES, SEO_ROUTE_PATHS } from './seoRoutes'
import { getSeoMetaForRoute } from './useSeo'
import { routes } from '../router'

const metaOf = (head: any, key: string) => head.meta.find((m: any) => m.name === key || m.property === key)?.content

describe('SEO_ROUTES', () => {
  it('only lists routes that useSeo actually allows to be indexed', () => {
    // A prerendered page carrying `noindex` would be wasted work, and a page
    // listed in the sitemap while telling crawlers to go away is worse.
    for (const route of SEO_ROUTES) {
      const head = getSeoMetaForRoute({ name: route.name, path: route.path })
      expect(metaOf(head, 'robots'), `${route.path} should be indexable`).toBe('index, follow')
    }
  })

  it('names routes that exist in the router, at the paths the router uses', () => {
    for (const route of SEO_ROUTES) {
      const match = routes.find((r: any) => r.name === route.name)
      expect(match, `no router route named "${route.name}"`).toBeDefined()
      expect(match.path).toBe(route.path)
    }
  })

  it('gives every route a distinct output file', () => {
    const files = SEO_ROUTES.map((route) => route.file)
    expect(new Set(files).size).toBe(files.length)
  })

  it('serves the home page from index.html, which is also the SPA entry', () => {
    expect(SEO_ROUTES.find((route) => route.path === '/')?.file).toBe('index.html')
  })

  it('keeps duplicate-content routes out of the sitemap but still prerenders them', () => {
    // /about renders the same component as /, so it is prerendered (people do
    // link to it) but points its canonical at / and stays out of the sitemap.
    expect(SEO_ROUTE_PATHS).not.toContain('/about')
    expect(SEO_ROUTES.map((r) => r.path)).toContain('/about')

    const head = getSeoMetaForRoute({ name: 'about', path: '/about' })
    expect(head.link).toContainEqual({ rel: 'canonical', href: 'https://metaspace2020.org/' })
  })
})
