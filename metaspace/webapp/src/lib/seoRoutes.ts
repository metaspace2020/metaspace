// Single source of truth for the public, indexable routes.

export interface SeoRoute {
  /** URL path, exactly as it appears in the router and the sitemap. */
  path: string
  /** vue-router route name, used to look up title/description in `useSeo`. */
  name: string
  /** Output file under `dist/`. */
  file: string
  changefreq: 'daily' | 'weekly' | 'monthly'
  priority: number
  /**
   * Set when this path must point its canonical elsewhere. `/about` renders
   * the very same component as `/`, so it declares `/` as canonical rather
   * than competing with it for the same query.
   */
  canonicalPath?: string
}

export const SEO_ROUTES: SeoRoute[] = [
  { path: '/', name: 'home', file: 'index.html', changefreq: 'weekly', priority: 1.0 },
  { path: '/pro', name: 'pro', file: 'pro.html', changefreq: 'weekly', priority: 0.9 },
  { path: '/annotations', name: 'annotations', file: 'annotations.html', changefreq: 'daily', priority: 0.8 },
  { path: '/datasets', name: 'dataset-list', file: 'datasets.html', changefreq: 'daily', priority: 0.8 },
  { path: '/about', name: 'about', file: 'about.html', changefreq: 'monthly', priority: 0.5, canonicalPath: '/' },
  { path: '/projects', name: 'project-list', file: 'projects.html', changefreq: 'weekly', priority: 0.6 },
  { path: '/groups', name: 'group-list', file: 'groups.html', changefreq: 'weekly', priority: 0.5 },
  { path: '/publications', name: 'publication-list', file: 'publications.html', changefreq: 'monthly', priority: 0.6 },
  { path: '/detectability', name: 'detectability', file: 'detectability.html', changefreq: 'monthly', priority: 0.5 },
  { path: '/faq', name: 'faq', file: 'faq.html', changefreq: 'monthly', priority: 0.6 },
  { path: '/contact', name: 'contact', file: 'contact.html', changefreq: 'monthly', priority: 0.6 },
]

export const SITEMAP_EXTRA_ENTRIES: Pick<SeoRoute, 'path' | 'changefreq' | 'priority'>[] = [
  { path: '/docs/', changefreq: 'weekly', priority: 0.8 },
]

export const SEO_ROUTE_PATHS: string[] = SEO_ROUTES.filter((route) => route.canonicalPath == null).map(
  (route) => route.path
)

/**
 * Links rendered into the static header of every prerendered page, so a
 * crawler that never runs JavaScript can still walk the site.
 */
export const SEO_NAV_LINKS: { path: string; label: string }[] = [
  { path: '/', label: 'Home' },
  { path: '/annotations', label: 'Annotations' },
  { path: '/datasets', label: 'Datasets' },
  { path: '/projects', label: 'Projects' },
  { path: '/groups', label: 'Groups' },
  { path: '/publications', label: 'Publications' },
  { path: '/pro', label: 'METASPACE Pro' },
  { path: '/detectability', label: 'Detectability' },
  { path: '/docs/', label: 'Documentation' },
  { path: '/faq', label: 'FAQ' },
  { path: '/contact', label: 'Contact' },
]
