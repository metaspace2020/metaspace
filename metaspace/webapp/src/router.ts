import Vue from 'vue';
import VueRouter from 'vue-router';
import AboutPage from './modules/App/AboutPage.vue';
import DatasetsPage from './modules/Datasets/DatasetsPage.vue';
import {DialogPage, ResetPasswordPage} from './modules/Account';

Vue.use(VueRouter);

const asyncPages = {
  AnnotationsPage: () => import(/* webpackPrefetch: true, webpackChunkName: "AnnotationsPage" */ './modules/Annotations/AnnotationsPage.vue'),
  DatasetSummary: () => import(/* webpackPrefetch: true, webpackChunkName: "DatasetSummary" */ './modules/Datasets/summary/DatasetSummary.vue'),
  MetadataEditPage: () => import(/* webpackPrefetch: true, webpackChunkName: "MetadataEditPage" */ './modules/MetadataEditor/MetadataEditPage.vue'),
  ImageAlignmentPage: () => import(/* webpackPrefetch: true, webpackChunkName: "ImageAlignmentPage" */ './modules/ImageAlignment/ImageAlignmentPage.vue'),
  UploadPage: () => import(/* webpackPrefetch: true, webpackChunkName: "UploadPage" */ './modules/MetadataEditor/UploadPage.vue'),

  // These pages are relatively small as they don't have any big 3rd party dependencies, so pack them together
  DatasetTable: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/Datasets/list/DatasetTable.vue'),
  HelpPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/App/HelpPage.vue'),
  EditUserPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/UserProfile/EditUserPage.vue'),
  CreateGroupPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/GroupProfile/CreateGroupPage.vue'),
  ViewGroupPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/GroupProfile/ViewGroupPage.vue'),
  ViewProjectPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/Project/ViewProjectPage.vue'),
  ProjectsListPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/Project/ProjectsListPage.vue'),
};

const convertLegacyHashUrls = () => {
  const {pathname, hash} = window.location;
  if (pathname === '/' && hash && hash.startsWith('#/')) {
    history.replaceState(undefined, undefined, hash.slice(1));
  }
};
convertLegacyHashUrls();

const router = new VueRouter({
  mode: 'history',
  routes: [
    { path: '/', component: AboutPage },
    { path: '/about', component: AboutPage },
    { path: '/annotations', component: asyncPages.AnnotationsPage },
    {
      path: '/datasets',
      component: DatasetsPage,
      children: [
        {path: '', component: asyncPages.DatasetTable},
        {path: 'summary', component: asyncPages.DatasetSummary},
      ]
    },
    { path: '/datasets/edit/:dataset_id', name: 'edit-metadata', component: asyncPages.MetadataEditPage },
    { path: '/datasets/:dataset_id/add-optical-image', name: 'add-optical-image', component: asyncPages.ImageAlignmentPage },
    { path: '/upload', component: asyncPages.UploadPage },
    { path: '/help', component: asyncPages.HelpPage },
    { path: '/user/me', component: asyncPages.EditUserPage },

    { path: '/admin/health', component: async () => await import('./modules/Admin/SystemHealthPage.vue') },
    { path: '/admin/groups', component: async () => await import('./modules/Admin/GroupsListPage.vue') },

    { path: '/account/sign-in', component: DialogPage, props: {dialog: 'signIn'} },
    { path: '/account/create-account', component: DialogPage, props: {dialog: 'createAccount'} },
    { path: '/account/forgot-password', component: DialogPage, props: {dialog: 'forgotPassword'} },
    { path: '/account/reset-password', component: ResetPasswordPage },

    { path: '/group/create', component: asyncPages.CreateGroupPage },
    { path: '/group/:groupIdOrSlug', name: 'group', component: asyncPages.ViewGroupPage },
    { path: '/project/:projectIdOrSlug', name: 'project', component: asyncPages.ViewProjectPage },
    { path: '/projects', component: asyncPages.ProjectsListPage },
  ]
});

export default router;
