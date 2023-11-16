import { createRouter, createWebHistory } from 'vue-router'
import { Component } from 'vue'
import NotFound from '../views/NotFoundPage.vue'

const asyncPagesFreelyTyped = {
  HomePage: () => import(/* webpackPrefetch: true, webpackChunkName: "SpottingProjectPage" */ '../views/View'),
  AnnotationsPage: () => import(/* webpackPrefetch: true, webpackChunkName: "AnnotationsPage" */ '../modules/Annotations/AnnotationsPage.vue'),
}
const asyncPages = asyncPagesFreelyTyped as Record<keyof typeof asyncPagesFreelyTyped, Component>


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: asyncPages.HomePage, meta: { footer: true, headerClass: 'bg-primary' } },
    {
      path: '/:pathMatch(.*)*',
      component: NotFound,
    },
    { path: '/annotations', name: 'annotations', component: asyncPages.AnnotationsPage },

  ],
})

export default router
