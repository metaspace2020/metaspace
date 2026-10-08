// JSON-LD emitted into the prerendered HTML.
//
// This is the part of the page an LLM crawler or a search engine can read
// without executing a single line of JavaScript, so it carries the facts that
// matter: what METASPACE is, who runs it, and what the Pro tiers answer.
//
// Everything here must also be true of the rendered page. Do not describe a
// feature, price or claim that a visitor would not find on the page itself.

import { PRODUCTION_ORIGIN } from './useSeo'
import { faqSeoEntries } from '../modules/Plans/sections/ProFaq'

const ORGANIZATION_ID = `${PRODUCTION_ORIGIN}/#organization`
const WEBSITE_ID = `${PRODUCTION_ORIGIN}/#website`

const organization = () => ({
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: 'METASPACE',
  url: PRODUCTION_ORIGIN,
  logo: `${PRODUCTION_ORIGIN}/assets/logo.png`,
  description:
    'METASPACE is an open-source engine for metabolite annotation of imaging mass spectrometry data, and a ' +
    'knowledgebase of metabolites from thousands of public datasets contributed by the community.',
  sameAs: ['https://github.com/metaspace2020/metaspace', 'https://ateam.bio/'],
})

const website = () => ({
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  url: PRODUCTION_ORIGIN,
  name: 'METASPACE',
  publisher: { '@id': ORGANIZATION_ID },
})

const softwareApplication = () => ({
  '@type': 'SoftwareApplication',
  name: 'METASPACE',
  applicationCategory: 'ScientificApplication',
  operatingSystem: 'Web browser',
  url: PRODUCTION_ORIGIN,
  publisher: { '@id': ORGANIZATION_ID },
  description:
    'Submit imaging mass spectrometry datasets and receive metabolite annotations with false discovery rate ' +
    'estimates, then browse, compare and share them against thousands of public datasets.',
  // The only price this page can state at build time. Plan pricing is loaded
  // from the API at runtime and deliberately left out rather than guessed.
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Public submissions and the annotation engine are free, plus three free private datasets a year.',
  },
})

const faqPage = () => ({
  '@type': 'FAQPage',
  mainEntity: faqSeoEntries().map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer },
  })),
})

/** JSON-LD graph for a route, or `null` when the route has nothing to declare. */
export function getStructuredDataForRoute(routeName: string): Record<string, unknown> | null {
  let graph: Record<string, unknown>[]

  if (routeName === 'home' || routeName === 'about') {
    graph = [organization(), website(), softwareApplication()]
  } else if (routeName === 'pro') {
    graph = [organization(), softwareApplication(), faqPage()]
  } else {
    graph = [organization(), website()]
  }

  return { '@context': 'https://schema.org', '@graph': graph }
}
