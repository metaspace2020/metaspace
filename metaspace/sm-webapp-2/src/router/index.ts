import { createRouter, createWebHistory } from 'vue-router'
import { Component } from 'vue'
import NotFound from '../modules/App/NotFoundPage.vue'
import AboutPage from '../modules/App/AboutPage'
import DatasetsPage from '../modules/Datasets/DatasetsPage.vue'

const asyncPagesFreelyTyped = {
  AnnotationsPage: () => import(/* webpackPrefetch: true, webpackChunkName: "AnnotationsPage" */ '../modules/Annotations/AnnotationsPage.vue'),

  // These pages are relatively small as they don't have any big 3rd party dependencies, so pack them together
  DatasetTable: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/Datasets/list/DatasetTable.vue'),
  HelpPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/App/HelpPage.vue'),
  PrivacyPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/App/PrivacyPage.vue'),

}
const asyncPages = asyncPagesFreelyTyped as Record<keyof typeof asyncPagesFreelyTyped, Component>


const router = createRouter({
  // @ts-ignore
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
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
      component: asyncPages.DatasetTable,
    },
    { path: '/datasets/edit/:dataset_id', name: 'edit-metadata', component: asyncPages.DatasetTable },
    { path: '/datasets/:dataset_id/add-optical-image', name: 'add-optical-image', component: asyncPages.DatasetTable },
    { path: '/dataset/:dataset_id', name: 'dataset-overview', component: asyncPages.DatasetTable },
    { path: '/dataset/:dataset_id/annotations', name: 'dataset-annotations', component: asyncPages.AnnotationsPage },
    { path: '/dataset/:dataset_id/browser', name: 'dataset-browser', component: asyncPages.DatasetTable },
    { path: '/dataset/:dataset_id/enrichment', name: 'dataset-enrichment', component: asyncPages.DatasetTable },

    { path: '/help', component: asyncPages.HelpPage, meta: { footer: true } },
    { path: '/privacy', component: asyncPages.PrivacyPage, meta: { footer: true } },


    {
      path: '/:pathMatch(.*)*',
      component: NotFound,
    },
  ],
  scrollBehavior(to, from, savedPosition) {
    // return desired position
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0 };
  },
})

export default router
