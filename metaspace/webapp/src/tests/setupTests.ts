// src/setupTests.ts
import { afterAll, beforeAll, vi, afterEach, expect } from 'vitest'
import svgMock from './mockSvg'
import { customSerializer } from './customSerializer'
import { config } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { h } from 'vue'
import moment from 'moment-timezone'

expect.addSnapshotSerializer(customSerializer)

// Assuming you're using `setupGlobalPlugins` as a custom setup function
export function setupGlobalPlugins() {
  config.global.plugins.push([ElementPlus])
}

export function setupGlobalStubs() {
  const ElOptionMock = {
    name: 'ElOptionMock',
    template: '<div class="mock-el-option"><slot></slot></div>',
    props: ['groupQueryChange'], // Add props used by the original component
    // inject: ['ElSelect'], // Mock the injection used by the real component
  }

  const ElSelectMock = {
    name: 'ElSelectMock',
    template: '<div class="mock-el-select"><slot></slot></div>',
  }

  const ElTreeSelectMock = {
    name: 'ElTreeSelectMock',
    template: '<div class="mock-el-tree-select"><slot></slot></div>',
  }

  const ElOptionGroupMock = {
    name: 'ElOptionGroupMock',
    template: '<div class="mock-el-option-group"><slot></slot></div>',
  }

  const ElIconMock = {
    name: 'ElIconMock',
    template: '<div class="mock-el-icon"><slot></slot></div>',
  }
  const ElPopoverMock = {
    name: 'ElPopoverMock',
    template: '<div class="mock-el-popover"><slot></slot></div>',
  }
  const ElTooltipMock = {
    name: 'ElTooltipMock',
    template: '<div class="mock-el-tooltip"><slot></slot></div>',
  }

  const ElDropdownMock = {
    name: 'ElDropdown',
    render: function (this: { $slots: { [key: string]: any } }) {
      return h('div', { class: 'mock-el-dropdown' }, [
        this.$slots.default ? this.$slots.default() : '',
        this.$slots.dropdown ? this.$slots.dropdown() : '',
      ])
    },
  }
  const ElDropdownMenuMock = {
    name: 'ElDropdownMenu',
    render: function (this: { $slots: { [key: string]: any } }) {
      return h('div', { class: 'mock-el-dropdown-menu' }, [this.$slots.default ? this.$slots.default() : ''])
    },
  }
  const ElDropdownItemMock = {
    name: 'ElDropdownItem',
    props: ['command'],
    render: function (this: { $slots: { [key: string]: any }; command: string }) {
      return h('div', { class: 'mock-el-dropdown-item', attrs: { command: this.command } }, [
        this.$slots.default ? this.$slots.default() : '',
      ])
    },
  }
  const ElDialogMock = {
    name: 'ElDialogMock',
    template: '<div class="mock-el-dialog"><slot></slot></div>',
  }
  const ElLoadingMock = {
    name: 'ElLoadingMock',
    template: '<div class="mock-el-loading"><slot></slot></div>',
  }
  // const ElFormMock = {
  //   name: 'ElFormMock',
  //   template: '<div class="mock-el-form"><slot></slot></div>',
  // };
  // const ElFormItemMock = {
  //   name: 'ElFormItemMock',
  //   template: '<div class="mock-el-form-item"><slot></slot></div>',
  // };
  const ElAutocompleteMock = {
    name: 'ElAutocompleteMock',
    template: '<div class="mock-el-autocomplete"><slot></slot></div>',
  }
  // const ElTableColumn = {
  //   name: 'ElTableColumn',
  //   template: '<div class="mock-el-table-column"><slot :row="{ user: { name: \'Test User\' } }"></slot></div>',
  // };
  const RouterLinkMock = {
    template: '<div><slot></slot></div>',
    props: ['to'],
  }

  config.global.stubs = {
    // 'el-form': ElFormMock,
    'el-autocomplete': ElAutocompleteMock,
    // 'el-table-column': ElTableColumn,
    // 'el-form-item': ElFormItemMock,
    'el-loading': ElLoadingMock,
    'el-loading-mask': ElLoadingMock,
    loading: ElLoadingMock,
    'el-option': ElOptionMock,
    'el-dropdown': ElDropdownMock,
    'el-dropdown-menu': ElDropdownMenuMock,
    'el-dropdown-item': ElDropdownItemMock,
    'el-dialog': ElDialogMock,
    'el-select': ElSelectMock,
    'el-tree-select': ElTreeSelectMock,
    'el-option-group': ElOptionGroupMock,
    'el-icon': ElIconMock,
    'el-popover': ElPopoverMock,
    'el-tooltip': ElTooltipMock,
    RouterLink: RouterLinkMock,
  }
}

// mock new jwt token
// @ts-ignore
global.fetch = vi.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ token: 'mock-token' }),
  })
)

// @ts-ignore
global.WebSocket = vi.fn().mockImplementation(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
}))

vi.mock('element-plus', async () => {
  const originalModule: any = await vi.importActual('element-plus')
  return {
    ...originalModule,
    generateId: () => 'fixed-id',
  }
})

vi.mock('vue', async () => {
  const actualVue: any = await vi.importActual('vue')

  return {
    ...actualVue,
    defineAsyncComponent: (loader) => {
      // Use a dummy component for SVG imports
      if (loader.toString().includes('.svg')) {
        return svgMock
      }
      // Otherwise, use the actual `defineAsyncComponent`
      return actualVue.defineAsyncComponent(loader)
    },
  }
})

export function setupGlobalVariables() {
  // @ts-ignore
  global.window.scrollTo = vi.fn()
  global.DragEvent = class extends MouseEvent {
    dataTransfer: DataTransfer
    constructor(type: string, init?: DragEventInit) {
      super(type, init)
      this.dataTransfer = init?.dataTransfer
    }
  }
  global.ClipboardEvent = class extends Event {
    clipboardData: DataTransfer
    constructor(type: string, eventInitDict?: ClipboardEventInit) {
      super(type, eventInitDict)
      this.clipboardData = eventInitDict?.clipboardData
    }
  }
  // @ts-ignore
  global.IntersectionObserver = class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  // global.requestAnimationFrame = callback => {
  //   return setTimeout(callback, 0);
  // };
  //
  // global.cancelAnimationFrame = id => {
  //   clearTimeout(id);
  // };
}

// Set a fixed date for your tests
const FIXED_DATE = '2020-01-03T00:00:00.000Z'

// Set up any global hooks or utilities for Apollo or Vue Testing
beforeAll(() => {
  vi.spyOn(global.Date, 'now').mockImplementation(() => new Date(FIXED_DATE).getTime())
  // Mock moment to return a fixed moment object when called without arguments
  vi.mock('moment', async () => {
    const actualMoment = (await vi.importActual('moment')).default // Correctly access the default export

    const mockedMoment = (...args) => {
      return args.length ? actualMoment(...args) : actualMoment(FIXED_DATE)
    }

    // Return the mocked function as the default export
    return { default: mockedMoment, __esModule: true }
  })

  moment.tz.setDefault('UTC')

  // Disable animations and transitions globally in tests
  const style = document.createElement('style')
  style.type = 'text/css'
  style.innerHTML = `* {
    animation: none !important;
    transition: none !important;
  }`
  document.head.appendChild(style)

  // Setup before all tests run, e.g., initializing Apollo Client
  // setupGlobalPlugins()
  setupGlobalVariables()
  setupGlobalStubs()
})

// Track unhandled rejections
const unhandledRejections = new Map()
process.on('unhandledRejection', (reason, promise) => {
  // console.error('Unhandled rejection', promise, 'reason:', reason);
  unhandledRejections.set(promise, reason)
})
process.on('rejectionHandled', (promise) => {
  unhandledRejections.delete(promise)
})

afterAll(() => {
  vi.restoreAllMocks()
  moment.tz.setDefault()

  // Cleanup after all tests have run
  // Check for unhandled rejections and fail the test if any are found
  if (unhandledRejections.size > 0) {
    throw new Error(`Unhandled promise rejections: ${Array.from(unhandledRejections.values()).join(', ')}`)
  }
})

afterEach(() => {
  // vi.clearAllMocks();
})
