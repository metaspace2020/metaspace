import Vue from 'vue';
import Vuex from 'vuex';
import VueRouter from 'vue-router';
import App from './App.vue';
import AnnotationTable from './components/AnnotationTable.vue';

import { Row, Col, Select, Option, Table, TableColumn, Loading,
         Input, InputNumber, Button, Tree, Radio, Scrollbar,
         Form, FormItem, Collapse, CollapseItem, Pagination, Popover,
         Dialog} from 'element-ui';
import lang from 'element-ui/lib/locale/lang/en';
import locale from 'element-ui/lib/locale';

import VueLazyload from 'vue-lazyload';

import ApolloClient, { createNetworkInterface } from 'apollo-client';
import VueApollo from 'vue-apollo';

const apolloClient = new ApolloClient({
  networkInterface: createNetworkInterface({
    //uri: 'http://localhost:3010/graphql',
    //uri: 'http://fed4d9a9.ngrok.io/graphql',
      uri: 'http://52.51.114.30:3010/graphql',
    transportBatching: true
  })
});

// setting up Element-UI components
// (they are imported individually to minimize bundle size)
locale.use(lang);
[Row, Col, Select, Option, Table, TableColumn, Loading,
 Input, InputNumber, Button, Form, FormItem, Radio, Scrollbar,
 Tree, Collapse, CollapseItem, Pagination, Popover, Dialog].forEach(component => Vue.use(component));

Vue.use(Vuex);
Vue.use(VueRouter);
Vue.use(VueApollo, { apolloClient });
Vue.use(VueLazyload);

import AnnotationsPage from './components/AnnotationsPage.vue';
import DatasetsPage from './components/DatasetsPage.vue';
import UploadPage from './components/UploadPage.vue';
import AboutPage from './components/AboutPage.vue';

import FILTER_SPECIFICATIONS from './filterSpecs.js';
const DEFAULT_FILTER = {
  database: 'HMDB',
  institution: undefined,
  datasetName: undefined,
  minMSM: 0.1,
  compoundName: undefined,
  adduct: undefined,
  mz: undefined,
  fdrLevel: 0.1
};

const store = new Vuex.Store({
  state: {
    // just a constant
    defaultFilter: DEFAULT_FILTER,

    // currently selected filter
    filter: DEFAULT_FILTER,

    // names of currently shown filters
    orderedActiveFilters: [],

    // currently selected annotation
    annotation: undefined
  },

  mutations: {
    updateFilter (state, filter) {
      let active = [];

      // drop unset filters
      for (var i = 0; i < state.orderedActiveFilters.length; i++) {
        let key = state.orderedActiveFilters[i];
        if (filter[key] !== undefined)
          active.push(key);
      }

      // append newly added filters to the end
      for (var key in filter)
        if (filter[key] !== undefined &&
            active.indexOf(key) == -1)
          active.push(key);

      state.filter = filter;
      state.orderedActiveFilters = active;
    },

    addFilter (state, name) {
      state.filter[name] = FILTER_SPECIFICATIONS[name].initialValue;
      state.orderedActiveFilters.push(name);
    },

    setAnnotation(state, annotation) {
      state.annotation = annotation;
    }
  }
})

const router = new VueRouter({
  routes: [
    { path: '/', redirect: '/annotations' },
    { path: '/annotations', component: AnnotationsPage },
    { path: '/datasets', component: DatasetsPage },
    { path: '/upload', component: UploadPage },
    { path: '/about', component: AboutPage }
  ]
})

new Vue({
  el: '#app',
  render: h => h(App),
  store,
  router
})
