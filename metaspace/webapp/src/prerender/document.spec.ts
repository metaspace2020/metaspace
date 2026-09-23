import { describe, it, expect } from 'vitest'
import { buildDocument, buildHeadHtml, buildShellDocument, buildSitemapXml, collectRouteCss } from './document'
import { SEO_ROUTES, SITEMAP_EXTRA_ENTRIES } from '../lib/seoRoutes'

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="Description" content="Generic placeholder">
    <title>METASPACE annotation platform</title>
  <link rel="stylesheet" crossorigin href="/assets/index.css">
</head>
<body id="app">
<script type="module" src="/assets/index.js"></script>
</body>
</html>`

describe('buildHeadHtml', () => {
  it('emits the route title, description, canonical and JSON-LD', () => {
    const head = buildHeadHtml('pro', '/pro')
    expect(head).toContain('<title>METASPACE Pro - Private datasets and downstream analysis</title>')
    expect(head).toContain('<meta name="robots" content="index, follow">')
    expect(head).toContain('<link rel="canonical" href="https://metaspace2020.org/pro">')
    expect(head).toContain('<script type="application/ld+json">')
  })

  it('collapses the multi-line descriptions so meta tags stay on one line', () => {
    const head = buildHeadHtml('annotations', '/annotations')
    const description = /<meta name="description" content="([^"]*)">/.exec(head)?.[1]
    expect(description).toBeDefined()
    expect(description).not.toMatch(/\s{2}/)
  })

  it('escapes the JSON-LD so it cannot close its own script tag', () => {
    const head = buildHeadHtml('pro', '/pro')
    const json = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(head)?.[1]
    expect(json).toBeDefined()
    expect(json).not.toContain('<')
    expect(() => JSON.parse(json!.replace(/\\u003c/g, '<'))).not.toThrow()
  })

  it('describes the Pro page with its FAQ, whose answers are otherwise collapsed', () => {
    const head = buildHeadHtml('pro', '/pro')
    const json = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(head)![1])
    const faq = json['@graph'].find((node: any) => node['@type'] === 'FAQPage')
    expect(faq).toBeDefined()
    expect(faq.mainEntity.length).toBeGreaterThan(0)
    for (const question of faq.mainEntity) {
      expect(question.name.length).toBeGreaterThan(0)
      expect(question.acceptedAnswer.text.length).toBeGreaterThan(0)
    }
  })
})

describe('buildDocument', () => {
  const doc = buildDocument(TEMPLATE, 'pro', '/pro', '<h1>Turning peaks into insights</h1>')

  it('replaces the template title and description instead of duplicating them', () => {
    expect(doc).not.toContain('METASPACE annotation platform')
    expect(doc).not.toContain('Generic placeholder')
    expect(doc.match(/<title>/g)).toHaveLength(1)
    expect(doc.match(/name="description"/gi)).toHaveLength(1)
  })

  it('puts the rendered markup inside the mount container, above the app bundle', () => {
    expect(doc).toContain('<h1>Turning peaks into insights</h1>')
    expect(doc.indexOf('<body id="app">')).toBeLessThan(doc.indexOf('<h1>'))
    expect(doc).toContain('/assets/index.js')
  })

  it('adds no nav of its own - the rendered shell already carries the header and footer links', () => {
    expect(doc).not.toContain('aria-label="Site"')
  })
})

describe('buildShellDocument', () => {
  const shell = buildShellDocument(TEMPLATE)

  it('tells crawlers not to index the routes it stands in for', () => {
    // Served for dataset pages, project pages and anything behind a login -
    // the same routes useSeo marks noindex once the app boots.
    expect(shell).toContain('<meta name="robots" content="noindex, nofollow">')
  })

  it('claims no canonical URL, since it answers for many different paths', () => {
    expect(shell).not.toContain('rel="canonical"')
    expect(shell).not.toContain('og:url')
  })
})

describe('buildSitemapXml', () => {
  const xml = buildSitemapXml('https://metaspace2020.org', '2026-01-01T00:00:00.000Z')

  it('lists every canonical route exactly once, then the extra entries', () => {
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])
    const expected = [...SEO_ROUTES.filter((r) => r.canonicalPath == null), ...SITEMAP_EXTRA_ENTRIES].map(
      (r) => `https://metaspace2020.org${r.path}`
    )
    expect(locs).toEqual(expected)
    expect(new Set(locs).size).toBe(locs.length)
  })

  it('links the docs site, which is a separate build with its own sitemap', () => {
    expect(xml).toContain('<loc>https://metaspace2020.org/docs/</loc>')
  })

  it('omits routes that canonicalise elsewhere', () => {
    expect(xml).not.toContain('/about<')
  })

  it('never lists the noindex shell or any other build artefact', () => {
    // The plugin this replaced crawled dist/ and listed /_shell as a real URL.
    expect(xml).not.toContain('_shell')
    expect(xml).not.toContain('.html')
  })

  it('carries the changefreq and priority declared on each route', () => {
    expect(xml).toContain('<changefreq>weekly</changefreq><priority>1.0</priority>')
  })
})

describe('collectRouteCss', () => {
  // Shaped like dist/.vite/manifest.json: a lazily loaded page chunk, the
  // shared chunk it imports, and the css each brings.
  const manifest = {
    'src/modules/Plans/ProPage.tsx': { file: 'assets/ProPage.js', css: ['assets/ProPage.css'], imports: ['_shared'] },
    _shared: { file: 'assets/shared.js', css: ['assets/shared.css', 'assets/ProPage.css'] },
    'src/modules/Faq/Faq.tsx': { file: 'assets/Faq.js', css: ['assets/Faq.css'], imports: ['_shared'] },
  }

  it("lists the page chunk's css after the css of what it imports, without duplicates", () => {
    expect(collectRouteCss(manifest, 'src/modules/Plans/ProPage.tsx')).toEqual([
      'assets/shared.css',
      'assets/ProPage.css',
    ])
  })

  it('yields nothing for an eagerly imported page, whose css is already in index.css', () => {
    expect(collectRouteCss(manifest, 'src/modules/App/AboutPage.tsx')).toEqual([])
    expect(collectRouteCss(manifest, null)).toEqual([])
  })
})

describe('buildDocument stylesheets', () => {
  it("links a route's css chunks right after index.css, so a lazy page is styled before its JavaScript runs", () => {
    const doc = buildDocument(TEMPLATE, 'pro', '/pro', '<h1>x</h1>', ['assets/shared.css', 'assets/ProPage.css'])
    const index = doc.indexOf('/assets/index.css')
    const shared = doc.indexOf('href="/assets/shared.css"')
    const pro = doc.indexOf('href="/assets/ProPage.css"')
    expect(index).toBeGreaterThan(-1)
    expect(shared).toBeGreaterThan(index)
    expect(pro).toBeGreaterThan(shared)
    expect(pro).toBeLessThan(doc.indexOf('</head>'))
  })

  it('does not link index.css a second time when the manifest lists it among the chunk css', () => {
    const doc = buildDocument(TEMPLATE, 'pro', '/pro', '<h1>x</h1>', ['assets/index.css', 'assets/ProPage.css'])
    expect(doc.match(/href="\/assets\/index\.css"/g)).toHaveLength(1)
    expect(doc.match(/href="\/assets\/ProPage\.css"/g)).toHaveLength(1)
  })

  it('adds no stylesheet links when the route has no chunk css', () => {
    const doc = buildDocument(TEMPLATE, 'home', '/', '<h1>x</h1>', [])
    expect(doc.match(/<link rel="stylesheet"/g)).toHaveLength(1)
  })
})
