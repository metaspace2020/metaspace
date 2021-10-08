declare module '*.vue' {
  import Vue from 'vue'
  export default Vue
}

declare module '*.svg' {
  import Vue, { VueConstructor } from 'vue'
  const content: VueConstructor<Vue>
  export default content
}

declare module 'vue-analytics'

declare module 'vue-slide-up-down'

declare module 'vue-resize-directive' {
  import { DirectiveFunction, DirectiveOptions } from 'vue'
  const resize: DirectiveFunction | DirectiveOptions
  export default resize
}

// Polyfill GlobalFetch type due to temporary issue in apollo-link: https://github.com/apollographql/apollo-link/issues/1131
declare type GlobalFetch = WindowOrWorkerGlobalScope
