import Vue from 'vue';
import VueRouter from 'vue-router';
import AboutPage from './components/AboutPage.vue';
import DatasetsPage from './components/DatasetsPage.vue';
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
    { path: '/help', component: async () => await import(/* webpackPrefetch: true, webpackChunkName: "HelpPage" */ './components/HelpPage.vue') }
  ]
})

export default router;
