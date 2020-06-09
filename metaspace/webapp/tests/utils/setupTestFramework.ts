import Vue from 'vue'
import ElementUI from 'element-ui'
import registerMockComponent from './registerMockComponent'
import VueRouter from 'vue-router'
import registerMockDirective from './registerMockDirective'
import * as vueTestUtils from '@vue/test-utils'
import { replaceConfigWithDefaultForTests } from '../../src/lib/config'
import VueCompositionApi from '@vue/composition-api'
import './mockGenerateId'

window.fetch = jest.fn()
window.scrollTo = jest.fn()

Vue.use(VueRouter)
Vue.use(ElementUI)
Vue.use(VueCompositionApi)
// Mock problematic ElementUI components
registerMockComponent('el-dialog')
registerMockComponent('el-popover')
registerMockComponent('el-tooltip', { methods: { updatePopper() {} } })
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
jest.mock('../../src/api/graphqlClient', () => require('./mockGraphqlClient'))

// Ignore delay duration
jest.mock('../../src/lib/delay', () => jest.fn(() => Promise.resolve()))

// Mock elapsed time as it relies on variables such as current time and locale
registerMockComponent('elapsed-time', { path: '../../src/components/ElapsedTime' })

// Automatically clean up components after each test to prevent stale components from updating due to e.g. route changes
// @ts-ignore
vueTestUtils.enableAutoDestroy(afterEach)

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
