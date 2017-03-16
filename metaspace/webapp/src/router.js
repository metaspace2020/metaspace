import AboutPage from './components/AboutPage.vue';
import AnnotationsPage from './components/AnnotationsPage.vue';
import DatasetsPage from './components/DatasetsPage.vue';
import DatasetTable from './components/DatasetTable.vue';
import MetadataEditPage from './components/MetadataEditPage.vue';
import UploadPage from './components/UploadPage.vue';
import HelpPage from './components/HelpPage.vue';

import Vue from 'vue';
import VueRouter from 'vue-router';

Vue.use(VueRouter);

const router = new VueRouter({
    routes: [
        { path: '/', redirect: '/annotations' },
        { path: '/annotations', component: AnnotationsPage },
        { path: '/datasets',
          component: DatasetsPage,
          children: [
            {path: '', component: DatasetTable},
            {path: 'edit/:dataset_id', component: MetadataEditPage, name: 'edit-metadata'}
          ]},
        { path: '/upload', component: UploadPage },
        { path: '/about', component: AboutPage },
        { path: '/help', component: HelpPage }
    ]
})

export default router;
