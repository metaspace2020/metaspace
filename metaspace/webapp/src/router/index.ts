/* eslint-disable vue/max-len */
import { createRouter, createWebHistory } from 'vue-router'
import { Component } from 'vue'
import AboutPage from '../modules/App/AboutPage'
import DatasetsPage from '../modules/Datasets/DatasetsPage.vue'
import { DialogPage, ResetPasswordPage } from '../modules/Account'
import { redirectAfterSignIn } from '../modules/Account/signInReturnUrl'
import { updateDBParam } from '../modules/Filters/url'
import NotFound from '../modules/App/NotFoundPage.vue'

const asyncPagesFreelyTyped = {
  AnnotationsPage: () =>
    import(
      /* webpackPrefetch: true, webpackChunkName: "AnnotationsPage" */ '../modules/Annotations/AnnotationsPage.vue'
    ),
  DatasetSummary: () =>
    import(
      /* webpackPrefetch: true, webpackChunkName: "DatasetSummary" */ '../modules/Datasets/summary/DatasetSummary.vue'
    ),
  MetadataEditPage: () =>
    import(
      /* webpackPrefetch: true, webpackChunkName: "MetadataEditPage" */ '../modules/MetadataEditor/MetadataEditPage.vue'
    ),
  ImageAlignmentPage: () =>
    import(
      /* webpackPrefetch: true, webpackChunkName: "ImageAlignmentPage" */ '../modules/ImageAlignment/ImageAlignmentPage.vue'
    ),
  UploadPage: () =>
    import(/* webpackPrefetch: true, webpackChunkName: "UploadPage" */ '../modules/MetadataEditor/UploadPage.vue'),
  DatasetOverviewPage: () =>
    import(
      /* webpackPrefetch: true, webpackChunkName: "DatasetOverviewPage" */ '../modules/Datasets/overview/DatasetOverviewPage'
    ),
  DatasetComparisonPage: () =>
    import(
      /* webpackPrefetch: true, webpackChunkName: "DatasetComparisonPage" */ '../modules/Datasets/comparison/DatasetComparisonPage'
    ),
  DatasetBrowserPage: () =>
    import(
      /* webpackPrefetch: true, webpackChunkName: "DatasetBrowserPage" */ '../modules/Datasets/imzml/DatasetBrowserPage'
    ),
  DatasetEnrichmentPage: () =>
    import(
      /* webpackPrefetch: true, webpackChunkName: "DatasetEnrichmentPage" */ '../modules/Datasets/enrichment/DatasetEnrichmentPage'
    ),
  SpottingProjectPage: () =>
    import(
      /* webpackPrefetch: true, webpackChunkName: "SpottingProjectPage" */ '../modules/SpottingProject/DashboardPage'
    ),
  MolecularDatabasesPage: () =>
    import(
      /* webpackPrefetch: true, webpackChunkName: "MolecularDatabasesPage" */ '../modules/MolecularDatabases/list/DatabaseList'
    ),
  NewsPage: () => import(/* webpackPrefetch: true, webpackChunkName: "NewsPage" */ '../modules/News/News'),

  // These pages are relatively small as they don't have any big 3rd party dependencies, so pack them together
  DatasetTable: () =>
    import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/Datasets/list/DatasetTable.vue'),
  HelpPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/App/HelpPage.vue'),
  EditUserPage: () =>
    import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/UserProfile/EditUserPage.vue'),
  CreateGroupPage: () =>
    import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/Group/CreateGroupPage.vue'),
  ProjectsListPage: () =>
    import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/Project/ProjectsListPage.vue'),
  SystemHealthPage: () =>
    import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/Admin/SystemHealthPage.vue'),
  GroupsListPage: () =>
    import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/Group/GroupsListPage'),
  PrivacyPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/App/PrivacyPage.vue'),
  TermsPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/App/TermsPage.vue'),
  PublicationsPage: () =>
    import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/App/PublicationsPage'),

  // These pages use sanitizeHtml, which is big
  ViewGroupPage: () =>
    import(/* webpackPrefetch: true, webpackChunkName: "Bundle2" */ '../modules/Group/ViewGroupPage.vue'),
  ViewProjectPage: () =>
    import(/* webpackPrefetch: true, webpackChunkName: "Bundle2" */ '../modules/Project/ViewProjectPage.vue'),

  // Separate bundle for design docs
  DesignTOC: () => import(/* webpackChunkName: "DesignBundle" */ '../design/TOCPage.vue'),
  DesignStyleGuide: () => import(/* webpackChunkName: "DesignBundle" */ '../design/StyleGuidePage.vue'),
  DesignIcons: () => import(/* webpackChunkName: "DesignBundle" */ '../design/IconsPage.vue'),
  DesignComponents: () => import(/* webpackChunkName: "DesignBundle" */ '../design/ComponentsPage.vue'),
  DesignForms: () => import(/* webpackChunkName: "DesignBundle" */ '../design/FormsPage.vue'),
  ContactPage: () => import(/* webpackPrefetch: true, webpackChunkName: "ContactPage" */ '../modules/Contact/Contact'),
  FAQPage: () => import(/* webpackPrefetch: true, webpackChunkName: "FAQPage" */ '../modules/Faq/Faq'),
  SplitPage: () => import(/* webpackPrefetch: true, webpackChunkName: "SplitPage" */ '../modules/Faq/Split'),

  // Pages that connect with pro

  PlansPage: () =>
    import(/* webpackPrefetch: true, webpackChunkName: "SpottingProjectPage" */ '../modules/Plans/PlansPage'),
  PaymentPage: () =>
    import(/* webpackPrefetch: true, webpackChunkName: "SpottingProjectPage" */ '../modules/Plans/PaymentPage'),
  SuccessPage: () =>
    import(/* webpackPrefetch: true, webpackChunkName: "SpottingProjectPage" */ '../modules/Plans/SuccessPage'),
  FeatureRequestPage: () =>
    import(
      /* webpackPrefetch: true, webpackChunkName: "SpottingProjectPage" */ '../modules/FeatureRequests/FeatureRequestPage'
    ),
}

const asyncPages = asyncPagesFreelyTyped as Record<keyof typeof asyncPagesFreelyTyped, Component>

const convertLegacyUrls = () => {
  const { pathname, hash, search } = window.location
  if (pathname === '/' && hash && hash.startsWith('#/')) {
    history.replaceState(undefined, undefined as any, hash.slice(1))
  }
  if (pathname === '/annotations') {
    const updatedQueryString = updateDBParam(search.slice(1))
    if (updatedQueryString !== null) {
      history.replaceState(undefined, undefined as any, `${pathname}?${updatedQueryString}`)
    }
  }
}
convertLegacyUrls()

export const routes: any = [
  { path: '/', name: 'home', component: AboutPage, meta: { footer: true, headerClass: 'bg-primary' } },
  { path: '/about', name: 'about', component: AboutPage, meta: { footer: true, headerClass: 'bg-primary' } },
  { path: '/annotations', name: 'annotations', component: asyncPages.AnnotationsPage },
  { path: '/contact', name: 'contact', component: asyncPages.ContactPage, meta: { footer: true } },
  { path: '/faq', name: 'faq', component: asyncPages.FAQPage, meta: { footer: true } },
  { path: '/split', name: 'split', component: asyncPages.SplitPage, meta: { footer: true } },
  {
    path: '/datasets',
    name: 'dataset-list',
    component: DatasetsPage,
    children: [
      { path: '', name: 'datasets', component: asyncPages.DatasetTable },
      { path: 'summary', name: 'summary', component: asyncPages.DatasetSummary },
    ],
  },
  {
    path: '/datasets/:dataset_id/comparison',
    name: 'datasets-comparison',
    component: asyncPages.DatasetComparisonPage,
  },
  { path: '/datasets/edit/:dataset_id', name: 'edit-metadata', component: asyncPages.MetadataEditPage },
  {
    path: '/datasets/:dataset_id/add-optical-image',
    name: 'add-optical-image',
    component: asyncPages.ImageAlignmentPage,
  },
  { path: '/dataset/:dataset_id', name: 'dataset-overview', component: asyncPages.DatasetOverviewPage },
  { path: '/dataset/:dataset_id/annotations', name: 'dataset-annotations', component: asyncPages.AnnotationsPage },
  { path: '/dataset/:dataset_id/browser', name: 'dataset-browser', component: asyncPages.DatasetBrowserPage },
  { path: '/dataset/:dataset_id/enrichment', name: 'dataset-enrichment', component: asyncPages.DatasetEnrichmentPage },
  { path: '/upload', name: 'upload', component: asyncPages.UploadPage },

  { path: '/learn', name: 'learn', component: asyncPages.HelpPage, meta: { footer: true } },
  { path: '/help', redirect: { name: 'learn' } },

  { path: '/user/me', name: 'profile', component: asyncPages.EditUserPage },

  { path: '/admin/health', name: 'admin', component: asyncPages.SystemHealthPage },

  { path: '/account/sign-in', name: 'sign-in', component: DialogPage, props: { dialog: 'signIn' } },
  { path: '/account/sign-in-success', name: 'sign-in-success', redirect: redirectAfterSignIn },
  { path: '/account/create-account', name: 'create-acc', component: DialogPage, props: { dialog: 'createAccount' } },
  { path: '/account/forgot-password', component: DialogPage, props: { dialog: 'forgotPassword' } },
  { path: '/account/reset-password', component: ResetPasswordPage },

  { path: '/groups', name: 'group-list', component: asyncPages.GroupsListPage },
  { path: '/group/create', name: 'group-create', component: asyncPages.CreateGroupPage },
  { path: '/group/:groupIdOrSlug', name: 'group', component: asyncPages.ViewGroupPage },

  { path: '/project/:projectIdOrSlug', name: 'project', component: asyncPages.ViewProjectPage },
  {
    // Legacy URL sent in "request access" emails up until Feb 2019
    path: '/project/:projectIdOrSlug/manage',
    redirect: { path: '/project/:projectIdOrSlug', query: { tab: 'members' } },
  },
  { path: '/projects', name: 'project-list', component: asyncPages.ProjectsListPage },

  { path: '/terms', name: 'terms', component: asyncPages.TermsPage, meta: { footer: true } },
  { path: '/privacy', name: 'privacy', component: asyncPages.PrivacyPage, meta: { footer: true } },
  { path: '/publications', name: 'publication-list', component: asyncPages.PublicationsPage, meta: { footer: true } },

  { path: '/design', name: 'design', component: asyncPages.DesignTOC, meta: { footer: true, flex: true } },
  { path: '/design/styleguide', component: asyncPages.DesignStyleGuide, meta: { footer: true, flex: true } },
  { path: '/design/icons', component: asyncPages.DesignIcons, meta: { footer: true, flex: true } },
  { path: '/design/components', component: asyncPages.DesignComponents, meta: { footer: true, flex: true } },
  { path: '/design/forms', component: asyncPages.DesignForms, meta: { footer: true, flex: true } },

  { path: '/detectability', name: 'detectability', component: asyncPages.SpottingProjectPage },

  { path: '/databases', name: 'molecular-databases', component: asyncPages.MolecularDatabasesPage },

  { path: '/news', name: 'news', component: asyncPages.NewsPage },

  { path: '/plans', name: 'plans', component: asyncPages.PlansPage },
  { path: '/payment', name: 'payment', component: asyncPages.PaymentPage },
  { path: '/success', name: 'success', component: asyncPages.SuccessPage },
  { path: '/feature-requests', name: 'feature-requests', component: asyncPages.FeatureRequestPage },

  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFound, meta: { footer: true, flex: true } },
]

const router = createRouter({
  // @ts-ignore
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    // return desired position
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0 }
  },
})

const pageLoadedAt = Date.now()
router.beforeEach((to, from, next) => {
  // If user has had the window open for a long time, it's likely they're using old code. This can cause issues
  // such as incorrect API usage, or causing error reports for bugs that have already been fixed.
  // Force the browser to reload the page, preferring to do so during page transitions to minimize impact.
  const daysSincePageLoad = (Date.now() - pageLoadedAt) / 1000 / 60 / 60 / 24
  if ((to.path !== from.path && daysSincePageLoad > 1.75) || daysSincePageLoad > 7) {
    window.location.assign(to.fullPath)
    next(false)
  } else {
    next()
  }
})

const { href } = router.resolve({ name: 'project', params: { projectIdOrSlug: 'REMOVE' } }, undefined)
export const PROJECT_URL_PREFIX = location.origin + href.replace('REMOVE', '')

export default router
