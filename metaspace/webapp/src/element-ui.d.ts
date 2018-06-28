declare module 'element-ui' {
  import Vue from 'vue';

  namespace ElementUI {
    export interface InstallationOptions {
      locale: any,
      i18n: any
    }

    export function install (vue: typeof Vue,
                             options: ElementUI.InstallationOptions): void
  }

  export = ElementUI
}

declare module 'vue/types/vue' {
  interface VueConstructor {
    $message: any
  }
}

declare module "element-ui/lib/locale/lang/en";
declare module "element-ui/lib/locale";
