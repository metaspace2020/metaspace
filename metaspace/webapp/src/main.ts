import Vue from 'vue';

import VueApollo from 'vue-apollo';
import apolloClient from './graphqlClient';
const VueAnalytics = require('vue-analytics').default;
Vue.use(VueApollo);

const apolloProvider = new VueApollo({
  defaultClient: apolloClient
})

import ElementUI from 'element-ui';
import './element-variables.scss';
import locale from 'element-ui/lib/locale/lang/en';
Vue.use(ElementUI, { locale });

import store from './store';
import router from './router';
import { sync } from 'vuex-router-sync';
sync(store, router);

import App from './App.vue';

const isProd = process.env.NODE_ENV === 'production';

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

//Vue.config.performance = true;

/*
if (module.hot) {
  module.hot.accept();
  module.hot.dispose(function() {
    clearInterval(timer);
  });
}
*/

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
