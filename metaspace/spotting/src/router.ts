/* eslint-disable vue/max-len */
import Vue, { AsyncComponent } from 'vue'
import VueRouter from 'vue-router'
import NotFoundPage from './modules/App/NotFoundPage.vue'

Vue.use(VueRouter)

const asyncPagesFreelyTyped = {
  DashboardPage: () => import(/* webpackPrefetch: true, webpackChunkName: "AnnotationsPage" */ './modules/Dashboard/DashboardPage.vue'),
}
const asyncPages = asyncPagesFreelyTyped as Record<keyof typeof asyncPagesFreelyTyped, AsyncComponent>

const convertLegacyUrls = () => {
  const { pathname, hash, search } = window.location
  if (pathname === '/' && hash && hash.startsWith('#/')) {
    history.replaceState(undefined, undefined as any, hash.slice(1))
  }
}
convertLegacyUrls()

const router = new VueRouter({
  mode: 'history',
  routes: [
    { path: '/(dashboard)?', name: 'dashboard', component: asyncPages.DashboardPage },
    { path: '*', component: NotFoundPage, meta: { footer: true, flex: true } },
  ],
  scrollBehavior(to, from, savedPosition) {
    if (to.hash) {
      return { selector: to.hash, offset: { x: 0, y: 64 } } // offset header height
    }
    if (savedPosition) {
      return savedPosition
    }
    if (to.path !== from.path) {
      return { x: 0, y: 0 }
    }
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

const { href } = router.resolve({ name: 'project', params: { projectIdOrSlug: 'REMOVE' } }, undefined, true)
export const PROJECT_URL_PREFIX = location.origin + href.replace('REMOVE', '')

export default router
