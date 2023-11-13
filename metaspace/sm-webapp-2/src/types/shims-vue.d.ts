/* eslint-disable */
import {ComponentInternalInstance, DefineComponent} from '@vue/runtime-core';

// This helps TypeScript understand what a .vue file is
declare module "*.vue" {
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

