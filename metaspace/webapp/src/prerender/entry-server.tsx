// Build-time SSR entry. `scripts/prerender.mjs` imports this from a Vite SSR
// bundle and asks it for the static markup of each indexable route.
//
// Why render the real components instead of writing static copy by hand: the
// prerendered HTML is what crawlers treat as the page. If it were maintained
// separately it would drift from what visitors see, which is both useless and
// a cloaking risk. Rendering the actual component keeps the two in step by
// construction.
//
// What this deliberately does NOT do is fetch data. Queries are answered by an
// empty in-process link, so anything data-driven (dataset counts, plan prices)
// renders in its empty or loading state. The marketing copy - which is what
// there is to index - is static and comes out in full.

import { createSSRApp, defineComponent, h, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '../modules/App/App.vue'
import { createHead } from '@unhead/vue'
import { DefaultApolloClient } from '@vue/apollo-composable'

import ElementPlusCustom from '../lib/element-plus'
import { ID_INJECTION_KEY } from 'element-plus'
import store from '../store'
import { createOfflineApolloClient } from './graphqlClient.stub'
import { SEO_ROUTES } from '../lib/seoRoutes'

export { SEO_ROUTES } from '../lib/seoRoutes'
export { buildDocument, buildShellDocument, buildSitemapXml, collectRouteCss } from './document'

// `source` is the path Vite's manifest uses as the key for a lazily loaded
// page chunk. It must match the module the router imports for that route.
interface PrerenderPage {
  source: string
  load: () => Promise<any>
}

const PAGES: Record<string, PrerenderPage> = {
  home: { source: 'src/modules/App/AboutPage.tsx', load: () => import('../modules/App/AboutPage') },
  about: { source: 'src/modules/App/AboutPage.tsx', load: () => import('../modules/App/AboutPage') },
  pro: { source: 'src/modules/Plans/ProPage.tsx', load: () => import('../modules/Plans/ProPage') },
  annotations: {
    source: 'src/modules/Annotations/AnnotationsPage.vue',
    load: () => import('../modules/Annotations/AnnotationsPage.vue'),
  },
  'dataset-list': {
    source: 'src/modules/Datasets/DatasetsPage.vue',
    load: () => import('../modules/Datasets/DatasetsPage.vue'),
  },
  'project-list': {
    source: 'src/modules/Project/ProjectsListPage.vue',
    load: () => import('../modules/Project/ProjectsListPage.vue'),
  },
  'group-list': {
    source: 'src/modules/Group/GroupsListPage.tsx',
    load: () => import('../modules/Group/GroupsListPage'),
  },
  'publication-list': {
    source: 'src/modules/App/PublicationsPage.tsx',
    load: () => import('../modules/App/PublicationsPage'),
  },
  detectability: {
    source: 'src/modules/SpottingProject/DashboardPage.tsx',
    load: () => import('../modules/SpottingProject/DashboardPage'),
  },
  faq: { source: 'src/modules/Faq/Faq.tsx', load: () => import('../modules/Faq/Faq') },
  contact: { source: 'src/modules/Contact/Contact.tsx', load: () => import('../modules/Contact/Contact') },
}

/** Manifest key of the page module for a route, for `collectRouteCss`. */
export const pageSourceFor = (routeName: string): string | null => PAGES[routeName]?.source ?? null

function buildRouter(routeName: string, page: Component) {
  // Only the route being rendered needs its real component; the rest exist so
  // that `router-link` and `useRoute()` resolve during render.
  const routes = SEO_ROUTES.map((route) => ({
    path: route.path,
    name: route.name,
    component: route.name === routeName ? page : defineComponent({ render: () => null }),
  }))
  routes.push({
    path: '/:pathMatch(.*)*',
    name: 'prerender-catch-all' as any,
    component: defineComponent({ render: () => null }),
  })
  return createRouter({ history: createMemoryHistory(), routes })
}

/** Renders one route to the markup that goes inside `<body id="app">`. */
export async function renderRoute(routeName: string, routePath: string): Promise<string> {
  const page_ = PAGES[routeName]
  if (!page_) {
    throw new Error(`No prerender loader registered for route "${routeName}"`)
  }
  const module = await page_.load()
  const page: Component = module.default ?? module

  const router = buildRouter(routeName, page)
  // Render the real application shell around the page, not the page alone:
  // App.vue puts `sm-main-content` and the layout classes on the router view,
  // and the page stylesheets scope everything under them. Without the shell
  // the prerendered markup is unstyled until the bundle mounts - which shows
  // as a flash of broken layout on every first paint.
  const app = createSSRApp(defineComponent({ name: 'PrerenderRoot', render: () => h(App) }))

  app.use(router)
  app.use(store as any)
  app.use(ElementPlusCustom)
  app.use(createHead())
  // Element Plus generates component ids from a counter it expects the host to
  // seed when server rendering; without it every render warns.
  app.provide(ID_INJECTION_KEY, { prefix: 1000, current: 0 })
  app.provide(DefaultApolloClient, createOfflineApolloClient())

  await router.push(routePath)
  await router.isReady()

  return await renderToString(app)
}
