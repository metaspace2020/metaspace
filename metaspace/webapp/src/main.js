import 'babel-polyfill';

import Vue from 'vue';

import ApolloClient, { createNetworkInterface } from 'apollo-client';
import VueApollo from 'vue-apollo';
import config from './clientConfig.json';

const apolloClient = new ApolloClient({
  networkInterface: createNetworkInterface({
    uri: config.graphqlUrl,
    transportBatching: true
  })
});
Vue.use(VueApollo, { apolloClient });

import ElementUI from 'element-ui';
import 'element-ui/lib/theme-default/index.css'
import lang from 'element-ui/lib/locale/lang/en';
import locale from 'element-ui/lib/locale';
locale.use(lang);
Vue.use(ElementUI);

import store from './store.js';
import router from './router.js';
import { sync } from 'vuex-router-sync';
sync(store, router);

import App from './App.vue';

//Vue.config.performance = true;

new Vue({
  el: '#app',
  render: h => h(App),
  store,
  router
})
