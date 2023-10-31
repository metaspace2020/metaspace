import { createRouter, createWebHistory } from 'vue-router'
import { Component } from 'vue'
import NotFound from '../views/NotFoundPage.vue'

const asyncPagesFreelyTyped = {
  HomePage: () => import(/* webpackPrefetch: true, webpackChunkName: "SpottingProjectPage" */ '../views/View'),
}
const asyncPages = asyncPagesFreelyTyped as Record<keyof typeof asyncPagesFreelyTyped, Component>


const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: asyncPages.HomePage, meta: { footer: true, headerClass: 'bg-primary' } },
    {
      path: '/:pathMatch(.*)*',
      component: NotFound,
    }
  ],
})

export default router
