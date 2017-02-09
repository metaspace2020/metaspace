import AnnotationsPage from './components/AnnotationsPage.vue';
import DatasetsPage from './components/DatasetsPage.vue';
import UploadPage from './components/UploadPage.vue';
import AboutPage from './components/AboutPage.vue';
import MetadataEditor from './components/MetadataEditor.vue';

import Vue from 'vue';
import VueRouter from 'vue-router';

Vue.use(VueRouter);

const router = new VueRouter({
    routes: [
        { path: '/', redirect: '/annotations' },
        { path: '/annotations', component: AnnotationsPage },
        { path: '/datasets', component: DatasetsPage },
        { path: '/upload', component: UploadPage },
        { path: '/about', component: AboutPage },
        { path: '/edit-metadata/:dataset_id', component: MetadataEditor, name: 'edit-metadata' }
    ]
})

export default router;
