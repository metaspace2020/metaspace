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
  ViewGroupProfile: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/GroupProfile/ViewGroupProfile.vue'),
  EditGroupProfile: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/GroupProfile/EditGroupProfile.vue'),
  ViewProjectPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/Project/ViewProjectPage.vue'),
  EditProjectPage: () => import(/* webpackPrefetch: true, webpackChunkName: "Bundle1" */ './modules/Project/EditProjectPage.vue'),
};

const router = new VueRouter({
  routes: [
    { path: '/', redirect: '/about' },
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
    { path: '/about', component: AboutPage },
    { path: '/help', component: asyncPages.HelpPage },
    { path: '/user/me', component: asyncPages.EditUserPage },

    { path: '/account/sign-in', component: DialogPage, props: {dialog: 'signIn'} },
    { path: '/account/create-account', component: DialogPage, props: {dialog: 'createAccount'} },
    { path: '/account/forgot-password', component: DialogPage, props: {dialog: 'forgotPassword'} },
    { path: '/account/reset-password', component: ResetPasswordPage },

    { path: '/group/create', component: asyncPages.CreateGroupPage },
    { path: '/group/:groupId', component: asyncPages.ViewGroupProfile },
    { path: '/group/:groupId/edit', component: asyncPages.EditGroupProfile },
    { path: '/project/:projectId', component: asyncPages.ViewProjectPage },
    { path: '/project/:projectId/edit', component: asyncPages.EditProjectPage },
  ]
});

export default router;
