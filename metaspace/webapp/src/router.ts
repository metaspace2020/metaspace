import Vue from 'vue';
import VueRouter from 'vue-router';
import AboutPage from './components/AboutPage.vue';
import DatasetsPage from './components/DatasetsPage.vue';
import DialogPage from './components/Account/DialogPage';
import ResetPasswordPage from './components/Account/ResetPasswordPage.vue';
import * as config from './clientConfig.json';

Vue.use(VueRouter);

const router = new VueRouter({
  routes: [
    { path: '/', redirect: '/about' },
    { path: '/annotations', component: async () => await import(/* webpackPrefetch: true, webpackChunkName: "AnnotationsPage" */ './components/AnnotationsPage.vue') },
    {
      path: '/datasets',
      component: DatasetsPage,
      children: [
        {path: '', component: async () => await import(/* webpackPrefetch: true, webpackChunkName: "DatasetTable" */ './components/DatasetTable.vue')},
        {path: 'summary', component: async () => await import(/* webpackPrefetch: true, webpackChunkName: "DatasetSummary" */ './components/plots/DatasetSummary.vue')},
      ]
    },

    {
      path: '/datasets/edit/:dataset_id',
      component: async () => await import(/* webpackPrefetch: true, webpackChunkName: "MetadataEditPage" */ './components/MetadataEditPage.vue'),
      name: 'edit-metadata'
    },
    {
      path: '/datasets/:dataset_id/add-optical-image',
      name: 'add-optical-image',
      component: async () => await import(/* webpackPrefetch: true, webpackChunkName: "ImageAlignmentPage" */ './components/ImageAlignmentPage.vue')
    },
    {
      path: '/upload',
      component: async () => await import(/* webpackPrefetch: true, webpackChunkName: "UploadPage" */ './components/UploadPage.vue')
    },
    { path: '/about', component: AboutPage },
    { path: '/help', component: async () => await import(/* webpackPrefetch: true, webpackChunkName: "HelpPage" */ './components/HelpPage.vue') },

    ...(config.features.newAuth ? [
      { path: '/account/sign-in', component: DialogPage, props: {dialog: 'signIn'} },
      { path: '/account/create-account', component: DialogPage, props: {dialog: 'createAccount'} },
      { path: '/account/forgot-password', component: DialogPage, props: {dialog: 'forgotPassword'} },
      { path: '/account/reset-password', component: ResetPasswordPage },
    ] : [])
  ]
});

export default router;
