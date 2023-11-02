import { createApp, nextTick } from 'vue'
import {createRouter, createWebHistory} from 'vue-router'
import registerMockComponent from './registerMockComponent'
import registerMockDirective from './registerMockDirective'
import * as vueTestUtils from '@vue/test-utils'
import { replaceConfigWithDefaultForTests } from '../../src/lib/config'
import './mockGenerateId'
import registerSVGIcons from './registerSVGIcons'
import './skipNewFeaturePopups'

window.fetch = jest.fn()
window.scrollTo = jest.fn()

const app = createApp({})
const router = createRouter({
  // Define your routes here
  history: createWebHistory(),
  routes: [] // Assuming no routes for now
})

app.use(router)


// Mock problematic ElementPlus components that are not mocked with Vue.use(ElementUi)
registerMockComponent('el-collapse', { path: 'element-plus/lib/collapse' })
registerMockComponent('el-collapse-item', { path: 'element-plus/lib/collapse-item' })
registerMockComponent('el-pagination', { path: 'element-plus/lib/pagination' })
registerMockComponent('el-popover', { path: 'element-plus/lib/popover' })
registerMockComponent('el-dialog')
registerMockComponent('el-tooltip')
registerMockComponent('el-autocomplete')
registerMockComponent('el-select')
registerMockComponent('el-option')
registerMockComponent('el-messagebox')
registerMockComponent('el-dropdown')
registerMockComponent('el-dropdown-menu')
registerMockComponent('el-dropdown-item')
registerMockComponent('el-tree')

registerMockDirective(app,'loading')

jest.mock('../../src/lib/reportError', () => jest.fn(console.error))

jest.mock('../../src/api/graphqlClient', () => require('./mockGraphqlClient'))

jest.mock('../../src/lib/delay', () => jest.fn(() => Promise.resolve()))

registerMockComponent('elapsed-time', { path: '../../src/components/ElapsedTime' })

registerSVGIcons(app)

vueTestUtils.enableAutoUnmount(afterEach)

replaceConfigWithDefaultForTests()

const originalNextTickFunction = nextTick
nextTick = async(callback?: any) => {
  await originalNextTickFunction()
  await originalNextTickFunction()
  await originalNextTickFunction()
  if(callback) await originalNextTickFunction(callback)
}
