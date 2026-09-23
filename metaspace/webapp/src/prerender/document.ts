// HTML assembly for the prerendered pages.
//
// Kept apart from `entry-server.tsx` so it stays free of Vue, Element Plus and
// the rest of the app: these are pure string functions the unit tests can
// exercise without booting anything.

import { SEO_NAV_LINKS, SEO_ROUTES, SITEMAP_EXTRA_ENTRIES } from '../lib/seoRoutes'
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

/** A plain-HTML nav so a crawler that never runs JS can still find the site. */
export function buildNavHtml(): string {
  const links = SEO_NAV_LINKS.map(
    (link) => `<li><a href="${escapeHtml(link.path)}">${escapeHtml(link.label)}</a></li>`
  ).join('')
  return `<nav aria-label="Site"><ul>${links}</ul></nav>`
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

/** The full HTML document for one prerendered route. */
export function buildDocument(template: string, routeName: string, routePath: string, markup: string): string {
  // Nav last: this markup is visible for the moment before the bundle mounts,
  // and a bare list of links above the page reads as a broken header. A
  // crawler does not care where in the document it finds them.
  const body = `<main>${markup}</main>\n${buildNavHtml()}`
  return injectBody(injectHead(template, buildHeadHtml(routeName, routePath)), body)
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
