/* eslint-disable */
import { App } from 'vue'
import { ElMessageBox } from 'element-plus'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
