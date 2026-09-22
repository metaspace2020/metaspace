import { describe, it, expect } from 'vitest'
import { buildDocument, buildHeadHtml, buildNavHtml, buildShellDocument, buildSitemapXml } from './document'
import { SEO_ROUTES } from '../lib/seoRoutes'

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="Description" content="Generic placeholder">
    <title>METASPACE annotation platform</title>
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

  it('includes a plain-HTML nav so a crawler can walk the site without JavaScript', () => {
    expect(buildNavHtml()).toContain('<a href="/pro">METASPACE Pro</a>')
    expect(doc).toContain('<a href="/annotations">Annotations</a>')
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

  it('lists every canonical route exactly once', () => {
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])
    const expected = SEO_ROUTES.filter((r) => r.canonicalPath == null).map((r) => `https://metaspace2020.org${r.path}`)
    expect(locs).toEqual(expected)
    expect(new Set(locs).size).toBe(locs.length)
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
