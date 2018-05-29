import Vue from 'vue';
import VueRouter from 'vue-router';
import DatasetsPage from './components/DatasetsPage.vue';
Vue.use(VueRouter);

const router = new VueRouter({
  routes: [
    { path: '/', redirect: '/about' },
    { path: '/annotations', component: async () => await import(/* webpackChunkName: "AnnotationsPage" */ './components/AnnotationsPage.vue') },
    {
      path: '/datasets',
      component: DatasetsPage,
      children: [
        {path: '', component: async () => await import(/* webpackChunkName: "DatasetTable" */ './components/DatasetTable.vue')},
        {path: 'edit/:dataset_id', component: async () => await import(/* webpackChunkName: "MetadataEditPage" */ './components/MetadataEditPage.vue'), name: 'edit-metadata'},
        {
          path: ':dataset_id/add-optical-image',
          name: 'add-optical-image',
          component: async () => await import(/* webpackChunkName: "ImageAlignmentPage" */ './components/ImageAlignmentPage.vue')
        }
      ]
    },
    {
      path: '/upload',
      component: async () => await import(/* webpackChunkName: "UploadPage" */ './components/UploadPage.vue')
    },
    { path: '/about', component: async () => await import(/* webpackChunkName: "AboutPage" */ './components/AboutPage.vue') },
    { path: '/help', component: async () => await import(/* webpackChunkName: "HelpPage" */ './components/HelpPage.vue') }
  ]
})

export default router;
