import { createRouter, createWebHistory } from 'vue-router'
import { Component } from 'vue'
import NotFound from '../modules/App/NotFoundPage.vue'
import AboutPage from '../modules/App/AboutPage'

const asyncPagesFreelyTyped = {
  AnnotationsPage: () => import(/* webpackPrefetch: true, webpackChunkName: "AnnotationsPage" */ '../modules/Annotations/AnnotationsPage.vue'),

  // These pages are relatively small as they don't have any big 3rd party dependencies, so pack them together
  HelpPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ '../modules/App/HelpPage.vue'),

}
const asyncPages = asyncPagesFreelyTyped as Record<keyof typeof asyncPagesFreelyTyped, Component>


const router = createRouter({
  // @ts-ignore
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: AboutPage, meta: { footer: true, headerClass: 'bg-primary' } },
    { path: '/about', component: AboutPage, meta: { footer: true, headerClass: 'bg-primary' } },
    { path: '/annotations', name: 'annotations', component: asyncPages.AnnotationsPage },
    { path: '/help', component: asyncPages.HelpPage, meta: { footer: true } },
    {
      path: '/:pathMatch(.*)*',
      component: NotFound,
    },
  ],
})

export default router
