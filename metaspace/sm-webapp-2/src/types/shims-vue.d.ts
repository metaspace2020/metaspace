/* eslint-disable */
// @ts-ignore
import { ComponentInternalInstance, DefineComponent } from '@vue/runtime-core'
import { RouteLocationNormalizedLoaded, Router } from 'vue-router'
//
// This helps TypeScript understand what a .vue file is
declare module '*.vue' {
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.md' {
  const component: DefineComponent<{}, {}, any>
  export default component
}

import { Store } from 'vuex'
// @ts-ignore
import { ComponentCustomProperties } from 'vue'
import { ElMessageBox, ElNotification } from '../lib/element-plus'

// Replace 'YourStoreStateType' with the actual type of your Vuex store state
declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $store: Store<any>
    $route: RouteLocationNormalizedLoaded
    $router: Router
    $alert: typeof ElMessageBox.alert
    $notification: typeof ElNotification
    onMounted?: any
    onUpdated?: any
    inject?: any
  }
}

declare module 'vue' {
  export const onMounted: any
  export const onUpdated: any
  export const inject: any
  export const provide: any

  export type PropType<T> = any
  export const onBeforeMount: any

  export const onBeforeUnmount: any
  export const onUnmounted: any
}
