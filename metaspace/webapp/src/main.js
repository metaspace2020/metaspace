import Vue from 'vue'
import VueRouter from 'vue-router'
import App from './App.vue'
import AnnotationTable from './components/AnnotationTable.vue'

import { Row, Col, Select, Option, Table, TableColumn,
         Input, InputNumber, Button, Tree, Radio, Scrollbar,
         Form, FormItem, Collapse, CollapseItem, Pagination, Popover } from 'element-ui'
import lang from 'element-ui/lib/locale/lang/en'
import locale from 'element-ui/lib/locale'

import VueLazyload from 'vue-lazyload';

import ApolloClient, { createNetworkInterface } from 'apollo-client';
import VueApollo from 'vue-apollo';

const apolloClient = new ApolloClient({
  networkInterface: createNetworkInterface({
    //uri: 'http://localhost:3010/graphql',
    uri: 'http://fed4d9a9.ngrok.io/graphql',
    transportBatching: true
  })
});

// setting up Element-UI components
// (they are imported individually to minimize bundle size)
locale.use(lang);
[Row, Col, Select, Option, Table, TableColumn,
 Input, InputNumber, Button, Form, FormItem, Radio, Scrollbar,
 Tree, Collapse, CollapseItem, Pagination, Popover].forEach(component => Vue.use(component));

Vue.use(VueRouter);
Vue.use(VueApollo, { apolloClient });
Vue.use(VueLazyload);

new Vue({
  el: '#app',
  render: h => h(App)
})
