import Vue from 'vue';

declare module 'vue/types/vue' {
  namespace Vue {
    const $apollo: any
  }
}

declare module 'vue/types/options' {
  interface ComponentOptions<V extends Vue> {
    apolloProvider?: any
  }
}
