/* eslint-disable vue/max-len */
import Vue, { AsyncComponent } from 'vue'
import VueRouter, { RawLocation } from 'vue-router'
import AboutPage from './modules/App/AboutPage.vue'
import DatasetsPage from './modules/Datasets/DatasetsPage.vue'
import { DialogPage, ResetPasswordPage } from './modules/Account'
import { redirectAfterSignIn } from './modules/Account/signInReturnUrl'
import { updateDBParam } from './modules/Filters/url'
import NotFoundPage from './modules/App/NotFoundPage.vue'

Vue.use(VueRouter)

const asyncPagesFreelyTyped = {
  AnnotationsPage: () => import(/* webpackPrefetch: true, webpackChunkName: "AnnotationsPage" */ './modules/Annotations/AnnotationsPage.vue'),
  DatasetSummary: () => import(/* webpackPrefetch: true, webpackChunkName: "DatasetSummary" */ './modules/Datasets/summary/DatasetSummary.vue'),
  MetadataEditPage: () => import(/* webpackPrefetch: true, webpackChunkName: "MetadataEditPage" */ './modules/MetadataEditor/MetadataEditPage.vue'),
  ImageAlignmentPage: () => import(/* webpackPrefetch: true, webpackChunkName: "ImageAlignmentPage" */ './modules/ImageAlignment/ImageAlignmentPage.vue'),
  UploadPage: () => import(/* webpackPrefetch: true, webpackChunkName: "UploadPage" */ './modules/MetadataEditor/UploadPage.vue'),
  DesignPage: () => import(/* webpackPrefetch: true, webpackChunkName: "DesignPage" */ './design/DesignPage.vue'),

  // These pages are relatively small as they don't have any big 3rd party dependencies, so pack them together
  DatasetTable: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/Datasets/list/DatasetTable.vue'),
  HelpPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/App/HelpPage.vue'),
  EditUserPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/UserProfile/EditUserPage.vue'),
  CreateGroupPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/GroupProfile/CreateGroupPage.vue'),
  ProjectsListPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/Project/ProjectsListPage.vue'),
  SystemHealthPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/Admin/SystemHealthPage.vue'),
  GroupsListPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/Admin/GroupsListPage.vue'),
  PrivacyPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/App/PrivacyPage.vue'),
  TermsPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/App/TermsPage.vue'),
  PublicationsPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/App/PublicationsPage.vue'),

  // These pages use sanitizeHtml, which is big
  ViewGroupPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle2" */ './modules/GroupProfile/ViewGroupPage.vue'),
  ViewProjectPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle2" */ './modules/Project/ViewProjectPage.vue'),
}
const asyncPages = asyncPagesFreelyTyped as Record<keyof typeof asyncPagesFreelyTyped, AsyncComponent>

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

const router = new VueRouter({
  mode: 'history',
  routes: [
    { path: '/(about)?', component: AboutPage, meta: { footer: true, headerClass: 'bg-primary' } },
    { path: '/annotations', component: asyncPages.AnnotationsPage },
    {
      path: '/datasets',
      component: DatasetsPage,
      children: [
        { path: '', component: asyncPages.DatasetTable },
        { path: 'summary', component: asyncPages.DatasetSummary },
      ],
    },
    { path: '/datasets/edit/:dataset_id', name: 'edit-metadata', component: asyncPages.MetadataEditPage },
    { path: '/datasets/:dataset_id/add-optical-image', name: 'add-optical-image', component: asyncPages.ImageAlignmentPage },
    { path: '/upload', component: asyncPages.UploadPage },
    { path: '/help', component: asyncPages.HelpPage, meta: { footer: true } },
    { path: '/user/me', component: asyncPages.EditUserPage },

    { path: '/admin/health', component: asyncPages.SystemHealthPage },
    { path: '/admin/groups', component: asyncPages.GroupsListPage },

    { path: '/account/sign-in', component: DialogPage, props: { dialog: 'signIn' } },
    { path: '/account/sign-in-success', redirect: redirectAfterSignIn },
    { path: '/account/create-account', component: DialogPage, props: { dialog: 'createAccount' } },
    { path: '/account/forgot-password', component: DialogPage, props: { dialog: 'forgotPassword' } },
    { path: '/account/reset-password', component: ResetPasswordPage },

    { path: '/group/create', component: asyncPages.CreateGroupPage },
    { path: '/group/:groupIdOrSlug', name: 'group', component: asyncPages.ViewGroupPage },

    { path: '/project/:projectIdOrSlug', name: 'project', component: asyncPages.ViewProjectPage },
    { // Legacy URL sent in "request access" emails up until Feb 2019
      path: '/project/:projectIdOrSlug/manage',
      redirect: { path: '/project/:projectIdOrSlug', query: { tab: 'members' } } as RawLocation,
    },
    { path: '/projects', component: asyncPages.ProjectsListPage },

    { path: '/terms', component: asyncPages.TermsPage, meta: { footer: true } },
    { path: '/privacy', component: asyncPages.PrivacyPage, meta: { footer: true } },
    { path: '/publications', component: asyncPages.PublicationsPage, meta: { footer: true } },

    { path: '/design', component: asyncPages.DesignPage, meta: { footer: true, flex: true } },

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

const { href } = router.resolve({ name: 'project', params: { projectIdOrSlug: 'REMOVE' } }, undefined, true)
export const PROJECT_URL_PREFIX = location.origin + href.replace('REMOVE', '')

export default router
