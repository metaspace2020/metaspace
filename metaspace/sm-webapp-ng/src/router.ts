/* eslint-disable vue/max-len */
import { createRouter, createWebHistory } from 'vue-router'
import { Component } from 'vue'

const asyncPagesFreelyTyped = {
  AboutPage: () => import(/* webpackPrefetch: true, webpackChunkName: "AnnotationsPage" */ './views/AboutView.vue'),
  ViewPage: () => import(/* webpackPrefetch: true, webpackChunkName: "SpottingProjectPage" */ './views/View'),
}
const asyncPages = asyncPagesFreelyTyped as Record<keyof typeof asyncPagesFreelyTyped, Component>

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: asyncPages.ViewPage, meta: { footer: true, headerClass: 'bg-primary' } },
    { path: '/about', component: asyncPages.AboutPage, meta: { footer: true, headerClass: 'bg-primary' } },
  ],
})

router.afterEach((to) => {
  console.log('to', to)
  // store.commit('updateFilterOnNavigate', to)
})

export default router
