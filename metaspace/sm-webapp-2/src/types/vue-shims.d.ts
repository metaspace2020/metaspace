declare module '*.vue' {
  import Vue from 'vue'
  export default Vue
}

declare module '*.svg' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<NonNullable<unknown>, NonNullable<unknown>, any>
  export default component
}

declare module 'vue-analytics'

declare module 'vue-slide-up-down'

// declare module 'vue-resize-directive' {
//   import { DirectiveFunction, DirectiveOptions } from 'vue'
//   const resize: DirectiveFunction | DirectiveOptions
//   export default resize
// }

// Polyfill GlobalFetch type due to temporary issue in apollo-link: https://github.com/apollographql/apollo-link/issues/1131
declare type GlobalFetch = WindowOrWorkerGlobalScope
