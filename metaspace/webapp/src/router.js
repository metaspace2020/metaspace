import AboutPage from './components/AboutPage.vue';
import AnnotationsPage from './components/AnnotationsPage.vue';
import DatasetsPage from './components/DatasetsPage.vue';
import DatasetTable from './components/DatasetTable.vue';
import MetadataEditPage from './components/MetadataEditPage.vue';
//import UploadPage from './components/UploadPage.vue';
import HelpPage from './components/HelpPage.vue';
//import ImageAlignmentPage from './components/ImageAlignmentPage.vue';

import Vue from 'vue';
import VueRouter from 'vue-router';

Vue.use(VueRouter);

const router = new VueRouter({
  routes: [
    { path: '/', redirect: '/about' },
    { path: '/annotations', component: AnnotationsPage },
    {
      path: '/datasets',
      component: DatasetsPage,
      children: [
        {path: '', component: DatasetTable},
        {path: 'edit/:dataset_id', component: MetadataEditPage, name: 'edit-metadata'}
      ]
    },
    {
      path: '/upload',
      component: function (resolve) {
        require.ensure(['./components/UploadPage.vue'], () => {
          resolve(require('./components/UploadPage.vue'))
        });
      }
    },
    { path: '/about', component: AboutPage },
    { path: '/help', component: HelpPage },
    {
      path: '/align/:dataset_id',
      component: function (resolve) {
        require.ensure(['./components/ImageAlignmentPage.vue'], () => {
          resolve(require('./components/ImageAlignmentPage.vue'))
        });
      }
    }
  ]
})

export default router;
