import Vue from 'vue';

declare module 'vue/types/vue' {
  interface VueConstructor {
    $apollo: any
  }
}

declare module 'vue/types/options' {
  interface ComponentOptions<V extends Vue> {
    apolloProvider?: any
    apollo?: any
  }
}
