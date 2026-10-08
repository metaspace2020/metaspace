import { computed, type Ref } from 'vue'
import { useHead } from '@unhead/vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { SEO_ROUTES } from './seoRoutes'
import config from './config'

const disabledDomains = ['staging.metaspace2020.org', 'staging.metaspace2020.eu']

function getCurrentHost(): string | null {
  if (typeof window !== 'undefined') {
    return window?.location?.hostname ?? null
  }
  return config.siteHostname ?? null
}

export const PRODUCTION_ORIGIN = 'https://metaspace2020.org'

// Several descriptions below are written as multi-line template literals, which
// would otherwise reach the meta tag with their newlines and source indentation.
const squish = (text: string): string => text.replace(/\s+/g, ' ').trim()

function buildHead(title: string, description: string, robots: string, path: string | null) {
  const ogImage = `${PRODUCTION_ORIGIN}/assets/logo.png`
  // `/about` renders the same component as `/`, so it points its canonical at
  // `/` instead of competing with it. See `seoRoutes.ts`.
  const canonicalPath = path ? SEO_ROUTES.find((route) => route.path === path)?.canonicalPath ?? path : null
  const canonical = canonicalPath ? `${PRODUCTION_ORIGIN}${canonicalPath}` : null
  return {
    title,
    meta: [
      { name: 'description', content: squish(description) },
      { name: 'robots', content: robots },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'METASPACE' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: squish(description) },
      { property: 'og:image', content: ogImage },
      ...(canonical ? [{ property: 'og:url', content: canonical }] : []),
      { name: 'twitter:card', content: 'summary' },
    ],
    link: canonical ? [{ rel: 'canonical', href: canonical }] : [],
  }
}

export function getSeoMetaForRoute(route: any | null) {
  let title = 'METASPACE - Spatial metabolomics'
  let description = 'The platform for metabolite annotation of imaging mass spectrometry data. '
  let robots = 'noindex, nofollow'

  // Handle case when route is not yet available
  if (!route || !route.name) {
    return buildHead(title, description, robots, null)
  }

  if (route.name === 'home' || route.name === 'about') {
    description =
      'The platform for metabolite annotation of imaging mass spectrometry data. ' +
      'The METASPACE platform hosts an engine for metabolite annotation of imaging mass spectrometry ' +
      'data as well as a spatial metabolite knowledgebase of the metabolites from thousands of public ' +
      'datasets provided by the community.'
    robots = 'index, follow'
  } else if (route.name === 'annotations') {
    title = 'METASPACE - Annotations'
    robots = 'index, follow'
    description = `Browse annotations from all public datasets using our interactive interface. 
    Search and compare your annotations with those from the community.`
  } else if (route.name === 'dataset-list') {
    title = 'METASPACE - Datasets'
    robots = 'index, follow'
    description = `Explore all public datasets using our interactive interface. Upload yours and 
    contribute to the community. `
  } else if (route.name === 'publication-list') {
    title = 'METASPACE - Publications'
    robots = 'index, follow'
    description = `Explore all publications presenting METASPACE or its methods. `
  } else if (route.name === 'detectability') {
    title = 'METASPACE - Detectability'
    robots = 'index, follow'
    description = `Large-Scale Evaluation of Spatial Metabolomics Protocols and Technologies tool. `
  } else if (route.name === 'project-list') {
    title = 'METASPACE - Projects'
    robots = 'index, follow'
    description = `If you are preparing a scientific publication based on METASPACE annotations, create 
    aproject and follow the 'Scientific Publishing' workflow. `
  } else if (route.name === 'group-list') {
    title = 'METASPACE - Groups'
    robots = 'index, follow'
    description = `Upload, share and manage data from your group in a simple, effective and safe way.`
  } else if (route.name === 'pro') {
    title = 'METASPACE Pro - Private datasets and downstream analysis'
    robots = 'index, follow'
    description =
      'Submit private datasets and run differential analysis, spatial segmentation and cross-dataset ' +
      'statistics on the METASPACE annotation engine. Compare plans, or start with three free private datasets.'
  } else if (route.name === 'faq') {
    title = 'METASPACE - FAQ'
    robots = 'index, follow'
    description = 'Answers to common questions about METASPACE, private datasets, plans and data privacy.'
  } else if (route.name === 'contact') {
    title = 'METASPACE - Contact'
    robots = 'index, follow'
    description = 'Get in touch with the METASPACE team for quotes, group plans, support and collaborations.'
  }

  const currentHost = getCurrentHost()
  if (currentHost != null && disabledDomains.includes(currentHost)) {
    robots = 'noindex, nofollow'
  }

  return buildHead(title, description, robots, route.path || null)
}

export function useSeoMeta(route: Ref<RouteLocationNormalizedLoaded>) {
  useHead(computed(() => getSeoMetaForRoute(route || null)))
}
