import 'babel-polyfill';

import Vue from 'vue';
import { sync } from 'vuex-router-sync';

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

import { Row, Col, Select, Option, Table, TableColumn, Loading,
         Input, InputNumber, Button, Tree, Radio, Scrollbar,
         Form, FormItem, Collapse, CollapseItem, Pagination, Popover,
         Dialog} from 'element-ui';
import lang from 'element-ui/lib/locale/lang/en';
import locale from 'element-ui/lib/locale';

// setting up Element-UI components
// (they are imported individually to minimize bundle size)
locale.use(lang);
[Row, Col, Select, Option, Table, TableColumn, Loading,
 Input, InputNumber, Button, Form, FormItem, Radio, Scrollbar,
 Tree, Collapse, CollapseItem, Pagination, Popover, Dialog].forEach(component => Vue.use(component));

Vue.use(VueApollo, { apolloClient });

import store from './store.js';
import router from './router.js';

sync(store, router);

import App from './App.vue';

new Vue({
  el: '#app',
  render: h => h(App),
  store,
  router
})
