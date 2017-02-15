import 'babel-polyfill';

import Vue from 'vue';

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

new Vue({
  el: '#app',
  render: h => h(App),
  store,
  router
})
