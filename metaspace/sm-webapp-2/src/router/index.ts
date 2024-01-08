import { createRouter, createWebHistory } from 'vue-router'
import { Component } from 'vue'
import NotFound from '../modules/App/NotFoundPage.vue'
import AboutPage from '../modules/App/AboutPage'
import DatasetsPage from '../modules/Datasets/DatasetsPage.vue'

const asyncPagesFreelyTyped = {
  AnnotationsPage: () => import(/* webpackPrefetch: true, webpackChunkName: "AnnotationsPage" */ '../modules/Annotations/AnnotationsPage.vue'),
  MetadataEditPage: () => import(/* webpackPrefetch: true, webpackChunkName: "MetadataEditPage" */ '../modules/MetadataEditor/MetadataEditPage.vue'),
  UploadPage: () => import(/* webpackPrefetch: true, webpackChunkName: "UploadPage" */ '../modules/MetadataEditor/UploadPage.vue'),
  DatasetOverviewPage: () => import(/* webpackPrefetch: true, webpackChunkName: "DatasetOverviewPage" */ '../modules/Datasets/overview/DatasetOverviewPage'),
  DatasetComparisonPage: () => import(/* webpackPrefetch: true, webpackChunkName: "DatasetOverviewPage" */ '../modules/Datasets/comparison/DatasetComparisonPage'),
  DatasetBrowserPage: () => import(/* webpackPrefetch: true, webpackChunkName: "DatasetOverviewPage" */ '../modules/Datasets/imzml/DatasetBrowserPage'),

  // These pages are relatively small as they don't have any big 3rd party dependencies, so pack them together
  DatasetTable: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/Datasets/list/DatasetTable.vue'),
  HelpPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/App/HelpPage.vue'),
  CreateGroupPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/Group/CreateGroupPage.vue'),
  ProjectsListPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/Project/ProjectsListPage.vue'),
  GroupsListPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/Group/GroupsListPage'),
  PrivacyPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/App/PrivacyPage.vue'),

  // These pages use sanitizeHtml, which is big
  ViewGroupPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle2" */ '../modules/Group/ViewGroupPage.vue'),
  ViewProjectPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle2" */ '../modules/Project/ViewProjectPage.vue'),

}
const asyncPages = asyncPagesFreelyTyped as Record<keyof typeof asyncPagesFreelyTyped, Component>

export const routes : any =[
  { path: '/', component: AboutPage, meta: { footer: true, headerClass: 'bg-primary' } },
  { path: '/about', component: AboutPage, meta: { footer: true, headerClass: 'bg-primary' } },
  { path: '/annotations', name: 'annotations', component: asyncPages.AnnotationsPage },
  {
    path: '/datasets',
    component: DatasetsPage,
    children: [
      { path: '', component: asyncPages.DatasetTable },
      { path: 'summary', component: asyncPages.DatasetTable },
    ],
  },
  {
    path: '/datasets/:dataset_id/comparison',
    name: 'datasets-comparison',
    component: asyncPages.DatasetComparisonPage,
  },
  { path: '/datasets/edit/:dataset_id', name: 'edit-metadata', component: asyncPages.MetadataEditPage },
  { path: '/datasets/:dataset_id/add-optical-image', name: 'add-optical-image', component: asyncPages.DatasetTable },
  { path: '/dataset/:dataset_id', name: 'dataset-overview', component: asyncPages.DatasetOverviewPage },
  { path: '/dataset/:dataset_id/annotations', name: 'dataset-annotations', component: asyncPages.AnnotationsPage },
  { path: '/dataset/:dataset_id/browser', name: 'dataset-browser', component: asyncPages.DatasetBrowserPage },
  { path: '/dataset/:dataset_id/enrichment', name: 'dataset-enrichment', component: asyncPages.DatasetTable },
  { path: '/upload', component: asyncPages.UploadPage },
  { path: '/help', component: asyncPages.HelpPage, meta: { footer: true } },



  { path: '/groups', component: asyncPages.GroupsListPage },
  { path: '/group/create', component: asyncPages.CreateGroupPage },
  { path: '/group/:groupIdOrSlug', name: 'group', component: asyncPages.ViewGroupPage },


  { path: '/project/:projectIdOrSlug', name: 'project', component: asyncPages.ViewProjectPage },
  { // Legacy URL sent in "request access" emails up until Feb 2019
    path: '/project/:projectIdOrSlug/manage',
    redirect: { path: '/project/:projectIdOrSlug', query: { tab: 'members' } },
  },
  { path: '/projects', component: asyncPages.ProjectsListPage },



  { path: '/privacy', component: asyncPages.PrivacyPage, meta: { footer: true } },


  {
    path: '/:pathMatch(.*)*',
    component: NotFound,
  },
]

const router = createRouter({
  // @ts-ignore
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    // return desired position
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0 };
  },
})

const pageLoadedAt = Date.now()
router.beforeEach((to, from, next) => {
  // If user has had the window open for a long time, it's likely they're using old code. This can cause issues
  // such as incorrect API usage, or causing error reports for bugs that have already been fixed.
  // Force the browser to reload the page, preferring to do so during page transitions to minimize impact.
  const daysSincePageLoad = (Date.now() - pageLoadedAt) / 1000 / 60 / 60 / 24
  if (to.path !== from.path && daysSincePageLoad > 1.75 || daysSincePageLoad > 7) {
    window.location.assign(to.fullPath)
    next(false)
  } else {
    next()
  }
})


const { href } = router.resolve({ name: 'project', params: { projectIdOrSlug: 'REMOVE' } }, undefined)
export const PROJECT_URL_PREFIX = location.origin + href.replace('REMOVE', '')

export default router
