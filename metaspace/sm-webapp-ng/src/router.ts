/* eslint-disable vue/max-len */
import { createRouter, createWebHistory } from 'vue-router'
import { defineAsyncComponent } from 'vue'

const asyncPagesFreelyTyped = {
  ViewPage: () => import(/* webpackPrefetch: true, webpackChunkName: "SpottingProjectPage" */ './views/View'),
}
const asyncPages = asyncPagesFreelyTyped as Record<keyof typeof asyncPagesFreelyTyped, any>

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: asyncPages.ViewPage, meta: { footer: true, headerClass: 'bg-primary' } },
  ],
})

router.afterEach((to) => {
  console.log('to', to)
  // store.commit('updateFilterOnNavigate', to)
})

export default router
