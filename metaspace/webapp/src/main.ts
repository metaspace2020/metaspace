import Vue from 'vue';

import * as config from './clientConfig.json';
import * as Raven from 'raven-js';
import * as RavenVue from 'raven-js/plugins/vue';
if(config.ravenDsn != null && config.ravenDsn !== '') {
  Raven.config(config.ravenDsn)
       .addPlugin(RavenVue, Vue)
       .install();
}

import VueApollo from 'vue-apollo';
import apolloClient, { setMaintenanceMessageHandler } from './graphqlClient';
Vue.use(VueApollo);

const apolloProvider = new VueApollo({
  defaultClient: apolloClient,
  defaultOptions: {
    $query: {
      fetchPolicy: 'network-only',
    },
  } as any,
});

import ElementUI from 'element-ui';
import './element-variables.scss';
import locale from 'element-ui/lib/locale/lang/en';
Vue.use(ElementUI, { locale });

import store from './store';
import router from './router';
import { sync } from 'vuex-router-sync';
sync(store, router);
router.afterEach((to) => {
  store.commit('updateFilterOnNavigate', to);
});

import App from './modules/App/App.vue';

const isProd = process.env.NODE_ENV === 'production';

import VueAnalytics from 'vue-analytics';
import { setErrorNotifier } from './lib/reportError'

Vue.use(VueAnalytics, {
  id: 'UA-73509518-1',
  router,
  autoTracking: {
    exception: isProd // disabled in dev because it impairs "break on uncaught exception"
  },
  debug: {
    // enabled: !isProd,
    sendHitTask: isProd
  }
});

Vue.config.devtools = process.env.NODE_ENV === 'development';
Vue.config.performance = process.env.NODE_ENV === 'development';

const app = new Vue({
  el: '#app',
  render: h => h(App),
    /*
  renderError (h, err) {
    return h('pre', { style: { color: 'red' }}, err.stack)
  },
  */
  store,
  router,
  provide: apolloProvider.provide(),
});

setErrorNotifier(app.$notify);
setMaintenanceMessageHandler(app.$alert);
