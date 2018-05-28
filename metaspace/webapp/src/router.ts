import Vue from 'vue';
import VueRouter from 'vue-router';

Vue.use(VueRouter);

const router = new VueRouter({
  routes: [
    { path: '/', redirect: '/about' },
    { path: '/annotations', component: () => import('./components/AnnotationsPage.vue') },
    {
      path: '/datasets',
      component: () => import('./components/DatasetsPage.vue'),
      children: [
        {path: '', component: () => import('./components/DatasetTable.vue')},
        {path: 'edit/:dataset_id', component: () => import('./components/MetadataEditPage.vue'), name: 'edit-metadata'},
        {
          path: ':dataset_id/add-optical-image',
          name: 'add-optical-image',
          component: () => import('./components/ImageAlignmentPage.vue')
        }
      ]
    },
    {
      path: '/upload',
      component: () => import('./components/UploadPage.vue')
    },
    { path: '/about', component: () => import('./components/AboutPage.vue') },
    { path: '/help', component: () => import('./components/HelpPage.vue') }
  ]
})

export default router;
