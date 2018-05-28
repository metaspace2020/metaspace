import Vue from 'vue';

import * as config from './clientConfig.json';
import * as Raven from 'raven-js';
import * as RavenVue from 'raven-js/plugins/vue';
if(config.ravenDsn != null) {
  Raven.config(config.ravenDsn)
       .addPlugin(RavenVue, Vue)
       .install();
}

import VueApollo from 'vue-apollo';
import apolloClient from './graphqlClient';
Vue.use(VueApollo);

const apolloProvider = new VueApollo({
  defaultClient: apolloClient
})

import './element-variables.scss';
import './registerElementUi';

import store from './store';
import router from './router';
import { sync } from 'vuex-router-sync';
sync(store, router);

import App from './App.vue';

const isProd = process.env.NODE_ENV === 'production';

import VueAnalytics from 'vue-analytics';
Vue.use(VueAnalytics, {
  id: 'UA-73509518-1',
  router,
  autoTracking: {
    exception: true
  },
  debug: {
    enabled: !isProd,
    sendHitTask: isProd
  }
});

Vue.config.performance = true;

new Vue({
  el: '#app',
  render: h => h(App),
    /*
  renderError (h, err) {
    return h('pre', { style: { color: 'red' }}, err.stack)
  },
  */
  store,
  router,
  apolloProvider
})
