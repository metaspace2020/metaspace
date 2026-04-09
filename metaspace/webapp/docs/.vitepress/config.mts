import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: '/docs/',
  srcDir: './src',
  outDir: '../dist-docs',
  title: 'METASPACE docs',
  description: 'METASPACE documentation',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started/overview' },
      { text: 'Features', link: '/features/visualization/ion-image-visualization' },
      { text: 'Guides', link: '/guides/before-submission/exporting-to-imzml' },
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
              { text: 'Multi-Dataset Comparison', link: '/features/visualization/multi-dataset-comparison' },
            ],
          },
          {
            text: 'Spatial Pattern Analysis',
            collapsed: true,
            items: [
              { text: 'ROI Selection', link: '/features/spatial-pattern-analysis/roi-selection' },
              // { text: 'Spatial Segmentation', link: '/features/spatial-pattern-analysis/spatial-segmentation' },  // Pro feature – in development
              // { text: 'ROI Differential Analysis', link: '/features/spatial-pattern-analysis/roi-differential-analysis' },  // Pro feature
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
              // { text: 'Understanding Differential Analysis', link: '/guides/interpreting-results/understanding-differential-analysis' },  // Pro feature
              // { text: 'Understanding Spatial Segmentation', link: '/guides/interpreting-results/understanding-spatial-segmentation' },  // Pro feature – in development
            ],
          },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/metaspace2020/metaspace' }],
  },
})
