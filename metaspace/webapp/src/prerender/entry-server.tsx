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
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { createHead } from '@unhead/vue'
import { DefaultApolloClient } from '@vue/apollo-composable'

import ElementPlusCustom from '../lib/element-plus'
import { ID_INJECTION_KEY } from 'element-plus'
import store from '../store'
import { createOfflineApolloClient } from './graphqlClient.stub'
import { SEO_ROUTES } from '../lib/seoRoutes'

export { SEO_ROUTES } from '../lib/seoRoutes'
export { buildDocument, buildShellDocument, buildSitemapXml } from './document'

const PAGE_LOADERS: Record<string, () => Promise<any>> = {
  home: () => import('../modules/App/AboutPage'),
  about: () => import('../modules/App/AboutPage'),
  pro: () => import('../modules/Plans/ProPage'),
  annotations: () => import('../modules/Annotations/AnnotationsPage.vue'),
  'dataset-list': () => import('../modules/Datasets/DatasetsPage.vue'),
  'project-list': () => import('../modules/Project/ProjectsListPage.vue'),
  'group-list': () => import('../modules/Group/GroupsListPage'),
  'publication-list': () => import('../modules/App/PublicationsPage'),
  detectability: () => import('../modules/SpottingProject/DashboardPage'),
  faq: () => import('../modules/Faq/Faq'),
  contact: () => import('../modules/Contact/Contact'),
}

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
  const loader = PAGE_LOADERS[routeName]
  if (!loader) {
    throw new Error(`No prerender loader registered for route "${routeName}"`)
  }
  const module = await loader()
  const page: Component = module.default ?? module

  const router = buildRouter(routeName, page)
  const app = createSSRApp(defineComponent({ name: 'PrerenderRoot', render: () => h(RouterView) }))

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
