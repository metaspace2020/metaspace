import { defineConfig, type HeadConfig } from 'vitepress'
import { readFileSync } from 'node:fs'

// The docs are built and served as part of the webapp deploy, so they share
// its clientConfig.json (templated by ansible). The GA4 measurement id lives
// there; an empty id leaves the docs untracked (dev, or an env without GA).
const loadClientConfig = (): Record<string, any> => {
  try {
    return JSON.parse(readFileSync(new URL('../../src/clientConfig.json', import.meta.url), 'utf8'))
  } catch {
    return {}
  }
}
const gaMeasurementId: string = process.env.GA_MEASUREMENT_ID || loadClientConfig().ga_measurement_id || ''

// Absolute base of the docs site, for the generated sitemap (sitemap URLs are
// relative to the docs root, so the hostname has to include the base path).
const docsHostname = process.env.DOCS_HOSTNAME || 'https://metaspace2020.org/docs/'

const analyticsHead: HeadConfig[] = gaMeasurementId
  ? [
      ['script', { async: '', src: `https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}` }],
      [
        'script',
        {},
        // The initial page_view is sent by this config call; SPA navigations
        // inside the docs are sent from .vitepress/theme/index.ts.
        `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaMeasurementId}');`,
      ],
    ]
  : []

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: '/docs/',
  srcDir: './src',
  outDir: '../dist-docs',
  title: 'METASPACE docs',
  description: 'METASPACE documentation',
  lang: 'en-US',
  lastUpdated: true,
  sitemap: { hostname: docsHostname },
  head: [
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'METASPACE' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ...analyticsHead,
  ],
  transformPageData(pageData) {
    const path = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '.html')
    const canonical = new URL(path, docsHostname).href
    const title = pageData.frontmatter.title || pageData.title || 'METASPACE docs'
    const description = pageData.frontmatter.description || pageData.description || ''
    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }]
    )
  },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started/overview' },
      { text: 'Features', link: '/features/visualization/ion-image-visualization' },
      { text: 'Guides', link: '/guides/before-submission/exporting-to-imzml' },
      { text: "What's new", link: '/whats-new' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Overview', link: '/getting-started/overview' },
          { text: 'Your METASPACE Journey', link: '/getting-started/typical-workflows' },
          {
            text: 'Dataset Organization',
            collapsed: false,
            items: [
              { text: 'Groups & Members', link: '/getting-started/dataset-organization/groups-and-members' },
              { text: 'Projects', link: '/getting-started/dataset-organization/projects' },
              { text: 'Account Settings', link: '/getting-started/dataset-organization/account-settings' },
            ],
          },
        ],
      },
      {
        text: 'Features',
        items: [
          {
            text: 'Visualization',
            collapsed: true,
            items: [
              { text: 'Ion Image Visualization', link: '/features/visualization/ion-image-visualization' },
              { text: 'Multi-Channel Ion Image Viewer', link: '/features/visualization/multi-channel-viewer' },
              { text: 'Optical Image Overlay', link: '/features/visualization/optical-image-overlay' },
            ],
          },
          {
            text: 'Spatial Pattern Analysis',
            collapsed: true,
            items: [
              { text: 'ROI Selection', link: '/features/spatial-pattern-analysis/roi-selection' },
              { text: 'Spatial Segmentation', link: '/features/spatial-pattern-analysis/spatial-segmentation' },
              { text: 'ROI Differential Analysis', link: '/features/spatial-pattern-analysis/roi-differential-analysis' },
            ],
          },
          {
            text: 'Cross-Dataset Comparison',
            collapsed: true,
            items: [
              { text: 'Multi-Dataset Comparison', link: '/features/cross-dataset-comparison/multi-dataset-comparison' },
              { text: 'Cross-Dataset Statistical Analysis', link: '/features/cross-dataset-comparison/cross-dataset-statistical-analysis' },
            ],
          },
          {
            text: 'Sharing & Publishing',
            collapsed: true,
            items: [
              { text: 'Sharing Annotations & Datasets', link: '/features/sharing-and-publishing/sharing-annotations-and-datasets' },
              { text: 'Publishing Projects', link: '/features/sharing-and-publishing/publishing-projects' },
            ],
          },
          {
            text: 'Tools & Integrations',
            collapsed: true,
            items: [
              { text: 'Custom Databases', link: '/features/tools-and-integrations/custom-databases' },
              { text: 'METASPACE Converter', link: '/features/tools-and-integrations/metaspace-converter' },
              { text: 'Detectability App', link: '/features/tools-and-integrations/detectability-app' },
              { text: 'Python Client', link: '/features/tools-and-integrations/python-client' },
            ],
          },
          {
            text: 'imzML Browser',
            collapsed: true,
            items: [
              { text: 'Spectral Visualization', link: '/features/imzml-browser/spectral-visualization' },
              { text: 'Reference Peak Normalization', link: '/features/imzml-browser/reference-peak-normalization' },
            ],
          },
        ],
      },
      {
        text: 'Guides',
        items: [
          {
            text: 'Before Submission',
            collapsed: true,
            items: [
              { text: 'Upload page', link: '/guides/before-submission/the-upload-page' },
              { text: 'Exporting to imzML Format', link: '/guides/before-submission/exporting-to-imzml' },
              { text: 'Metadata Recommendations', link: '/guides/before-submission/metadata-recommendations' },
            ],
          },
          {
            text: 'Interpreting Results',
            collapsed: true,
            items: [
              { text: 'Understanding the Annotation Page', link: '/guides/interpreting-results/understanding-annotation-page' },
              { text: 'Off-Sample Filtering', link: '/guides/interpreting-results/off-sample-filtering' },
              { text: 'Colocalization', link: '/guides/interpreting-results/colocalization' },
              { text: 'Understanding Differential Analysis', link: '/guides/interpreting-results/understanding-differential-analysis' },
              { text: 'Understanding Spatial Segmentation', link: '/guides/interpreting-results/understanding-spatial-segmentation' },
              { text: 'Understanding Cross-Dataset Statistical Results', link: '/guides/interpreting-results/understanding-cross-dataset-statistical-results' },
            ],
          },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/metaspace2020/metaspace' }],
  },
})
