/* eslint-disable */
import {ComponentInternalInstance, DefineComponent} from '@vue/runtime-core';
import { RouteLocationNormalizedLoaded, Router } from 'vue-router';

// This helps TypeScript understand what a .vue file is
declare module "*.vue" {
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

import { Store } from 'vuex';
import { ComponentCustomProperties } from 'vue';
import {ElMessageBox, ElNotification} from "element-plus";

// Replace 'YourStoreStateType' with the actual type of your Vuex store state
declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $store: Store<any>;
    $route: RouteLocationNormalizedLoaded;
    $router: Router;
    $alert: typeof ElMessageBox.alert;
    $notification: typeof ElNotification;
  }
}
