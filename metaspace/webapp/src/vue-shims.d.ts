declare module "*.vue" {
  import Vue from "vue";
  export default Vue;
}

declare module 'vue-analytics';
declare module 'raven-js/plugins/vue';

declare module "plotly.js/src/components/colorscale/scales.js"
declare module "plotly.js/src/components/colorscale/extract_scale.js"

declare module "vue-slide-up-down";

declare module "vue-apollo/types/vue-apollo" {
  import { ApolloProperty } from 'vue-apollo/types/vue-apollo';
  import { ApolloClient } from 'apollo-client';

  export interface ApolloProperty<V> {
  }
}
