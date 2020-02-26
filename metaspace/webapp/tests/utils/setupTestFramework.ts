import Vue from 'vue'
import ElementUI from 'element-ui'
import registerMockComponent from './registerMockComponent'
import VueRouter from 'vue-router'
import registerMockDirective from './registerMockDirective'
import { Wrapper, config as vueTestConfig } from '@vue/test-utils'
import { replaceConfigWithDefaultForTests } from '../../src/config'
import VueCompositionApi from '@vue/composition-api'

window.fetch = jest.fn()

vueTestConfig.logModifiedComponents = false

Vue.use(VueRouter)
Vue.use(ElementUI)
Vue.use(VueCompositionApi)
// Mock problematic ElementUI components
registerMockComponent('el-dialog')
registerMockComponent('el-popover')
registerMockComponent('el-tooltip')
registerMockComponent('el-autocomplete')
registerMockComponent('el-select')
registerMockComponent('el-option')
registerMockComponent('el-messagebox')
registerMockComponent('el-dropdown')
registerMockComponent('el-dropdown-menu')
registerMockComponent('el-dropdown-item')
registerMockComponent('el-tree')
registerMockComponent('el-pagination')

// Mock problematic directives
registerMockDirective('loading')

// Mock error reporting
jest.mock('../../src/lib/reportError', () => jest.fn(console.error))

// Prevent JWT requests
jest.mock('../../src/graphqlClient', () => require('./mockGraphqlClient'))

// Transitions throw errors because cssstyle doesn't support transition styles
registerMockComponent('transition', { abstract: true }) //  ElTreeNode relies on Transition being abstract
registerMockComponent('transition-group')

// Ignore delay duration
jest.mock('../../src/lib/delay', () => jest.fn(() => Promise.resolve()))

// Mock elapsed time as it relies on variables such as current time and locale
registerMockComponent('elapsed-time', { path: '../../src/components/ElapsedTime' })

// Track all components mounted by vue-test-utils and automatically clean them up after each test to prevent stale
// components from updating due to e.g. route changes
const mockWrappers: Wrapper<Vue>[] = []
jest.mock('@vue/test-utils', () => {
  const wrapVueTestToolsFunction = (originalFunc: ((...args: any[]) => Wrapper<Vue>)) => {
    return function(...args: any[]) {
      const wrapper = originalFunc(...args)
      mockWrappers.push(wrapper)
      return wrapper
    }
  }
  const actual = require.requireActual('@vue/test-utils')
  return Object.assign({}, actual, {
    mount: wrapVueTestToolsFunction(actual.mount),
    shallowMount: wrapVueTestToolsFunction(actual.shallowMount),
  })
})

afterEach(() => {
  while (mockWrappers.length > 0) {
    mockWrappers.pop()!.destroy()
  }
})

// Use consistent config
// TODO: Change metadata to always ship with all available types, but filter at runtime based on config
// so that it's not environment-dependent in tests
replaceConfigWithDefaultForTests()

// Change Vue.nextTick() to wait multiple ticks, because Apollo often takes multiple ticks to return data
const originalNextTick = Vue.nextTick
Vue.nextTick = async(callback?: any, context?: any) => {
  await originalNextTick()
  await originalNextTick()
  await originalNextTick()
  await originalNextTick(callback, context)
}
