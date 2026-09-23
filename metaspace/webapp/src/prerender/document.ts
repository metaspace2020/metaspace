// HTML assembly for the prerendered pages.
//
// Kept apart from `entry-server.tsx` so it stays free of Vue, Element Plus and
// the rest of the app: these are pure string functions the unit tests can
// exercise without booting anything.

import { SEO_ROUTES, SITEMAP_EXTRA_ENTRIES } from '../lib/seoRoutes'
import { getSeoMetaForRoute } from '../lib/useSeo'
import { getStructuredDataForRoute } from '../lib/structuredData'

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** `<title>`, meta, canonical and JSON-LD for a route, as HTML. */
export function buildHeadHtml(routeName: string, routePath: string): string {
  const head = getSeoMetaForRoute({ name: routeName, path: routePath })
  const lines = [`<title>${escapeHtml(head.title)}</title>`]

  for (const meta of head.meta) {
    const key = 'name' in meta ? 'name' : 'property'
    const value = (meta as any).name ?? (meta as any).property
    lines.push(`<meta ${key}="${escapeHtml(value)}" content="${escapeHtml((meta as any).content)}">`)
  }
  for (const link of head.link) {
    lines.push(`<link rel="${escapeHtml(link.rel)}" href="${escapeHtml(link.href)}">`)
  }

  const structuredData = getStructuredDataForRoute(routeName)
  if (structuredData) {
    // `</script>` inside JSON would close this tag early; `<` is the only
    // character that can do damage inside a JSON-LD block.
    const json = JSON.stringify(structuredData).replace(/</g, '\\u003c')
    lines.push(`<script type="application/ld+json">${json}</script>`)
  }

  return lines.map((line) => `    ${line}`).join('\n')
}

/**
 * Strips the template's own title and description so the route-specific ones
 * are not competing with a generic pair left over from `index.html`.
 */
function stripTemplateHead(template: string): string {
  return template
    .replace(/[ \t]*<title>[\s\S]*?<\/title>\r?\n?/i, '')
    .replace(/[ \t]*<meta\s+name=["']description["'][^>]*>\r?\n?/i, '')
}

function injectHead(template: string, headHtml: string): string {
  return stripTemplateHead(template).replace(/<\/head>/i, `${headHtml}\n</head>`)
}

function injectBody(template: string, bodyHtml: string): string {
  // Vue clears the mount container before mounting, so this markup is replaced
  // by the live app as soon as the bundle runs. It exists for the fetch that
  // never runs it.
  return template.replace(/(<body id="app">)/i, `$1\n<div id="prerendered-content">${bodyHtml}</div>`)
}

/** The subset of Vite's build manifest this needs. */
export interface ManifestChunk {
  file: string
  css?: string[]
  imports?: string[]
}
export type Manifest = Record<string, ManifestChunk>

/**
 * CSS files a route's page chunk brings with it, in load order: the chunk's
 * own stylesheets after those of everything it statically imports. A key
 * that is not in the manifest yields nothing - that is the eager-import case,
 * whose CSS is already in index.css.
 */
export function collectRouteCss(manifest: Manifest, sourceKey: string | null): string[] {
  const seen = new Set<string>()
  const css: string[] = []
  const visit = (key: string) => {
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    const chunk = manifest[key]
    if (!chunk) {
      return
    }
    for (const dep of chunk.imports ?? []) {
      visit(dep)
    }
    for (const file of chunk.css ?? []) {
      if (!css.includes(file)) {
        css.push(file)
      }
    }
  }
  if (sourceKey) {
    visit(sourceKey)
  }
  return css
}

function injectStylesheets(template: string, cssFiles: string[]): string {
  // A page chunk imports the entry chunk, so the manifest hands back index.css
  // too; anything the template already links is skipped.
  cssFiles = cssFiles.filter((file) => !template.includes(`href="/${file}"`))
  if (cssFiles.length === 0) {
    return template
  }
  // After index.css, so the cascade matches what the running app produces
  // when it appends the chunk's stylesheet later.
  const links = cssFiles.map((file) => `  <link rel="stylesheet" crossorigin href="/${escapeHtml(file)}">`).join('\n')
  const marker = /(<link rel="stylesheet"[^>]*href="\/assets\/index\.css"[^>]*>)/i
  return marker.test(template)
    ? template.replace(marker, `$1\n${links}`)
    : template.replace(/<\/head>/i, `${links}\n</head>`)
}

/** The full HTML document for one prerendered route. */
export function buildDocument(
  template: string,
  routeName: string,
  routePath: string,
  markup: string,
  cssFiles: string[] = []
): string {
  // The page is rendered inside the real application shell, so the header and
  // footer - and their links - are already part of `markup`.
  const body = `<main>${markup}</main>`
  const withCss = injectStylesheets(template, cssFiles)
  return injectBody(injectHead(withCss, buildHeadHtml(routeName, routePath)), body)
}

/**
 * The fallback document nginx serves for any path that is not prerendered -
 * dataset pages, project pages, anything behind a login. It carries the same
 * `noindex` that `useSeo` applies to those routes at runtime, so a crawler
 * that cannot execute JavaScript is told the same thing as one that can,
 * instead of seeing the home page duplicated across every URL.
 */
export function buildShellDocument(template: string): string {
  return injectHead(template, buildHeadHtml('prerender-shell', ''))
}

/**
 * The sitemap, generated from the same route list everything else uses.
 *
 * This used to be left to `vite-plugin-sitemap`, which crawls the output
 * directory for .html files. Once the build started writing a file per route
 * that became a liability: it picked up the prerendered pages left by the
 * previous build and listed `/_shell` - the noindex fallback - as a public
 * URL, alongside duplicates of every dynamic route.
 */
export function buildSitemapXml(origin: string, lastmod: string): string {
  const entries = [...SEO_ROUTES.filter((route) => route.canonicalPath == null), ...SITEMAP_EXTRA_ENTRIES]
  const urls = entries
    .map((route) =>
      [
        '  <url>',
        `<loc>${escapeHtml(origin + route.path)}</loc>`,
        `<lastmod>${escapeHtml(lastmod)}</lastmod>`,
        `<changefreq>${route.changefreq}</changefreq>`,
        `<priority>${route.priority.toFixed(1)}</priority>`,
        '</url>',
      ].join('')
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}
