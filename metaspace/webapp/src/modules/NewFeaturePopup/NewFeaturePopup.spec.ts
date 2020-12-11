import { mount } from '@vue/test-utils'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'

import NewFeaturePopup from './NewFeaturePopup.vue'
import PopupAnchor from './PopupAnchor.vue'
import useNewFeaturePopups from './useNewFeaturePopups'

import router from '../../router'
import store from '../../store'

// for mocks
import { ref } from '@vue/composition-api'
import * as useIntersectionObserver from '../../lib/useIntersectionObserver'
import * as localStorage from '../../lib/localStorage'

jest.mock('popper.js')
jest.mock('../../lib/useIntersectionObserver')
const mockUseIntersectionObserver = useIntersectionObserver as jest.Mocked<typeof useIntersectionObserver>
jest.mock('../../lib/localStorage')
const mockLocalStorage = localStorage as jest.Mocked<typeof localStorage>

Vue.use(Vuex)
sync(store, router)

function mockIntersectionObserver({ isIntersecting = false, isFullyInView = false, intersectionRatio = 0 }) {
  mockUseIntersectionObserver.default.mockImplementation(() => ({
    isIntersecting: ref(isIntersecting),
    isFullyInView: ref(isFullyInView),
    intersectionRatio: ref(intersectionRatio),
    observe: jest.fn(),
    unobserve: jest.fn(),
  }))
}

describe('NewFeaturePopup', () => {
  const TestNewFeaturePopup = Vue.component('test-new-feature-popup', {
    components: {
      anchor: PopupAnchor, // full name is mocked
      NewFeaturePopup,
    },
    props: ['showUntil'],
    template: `
      <div>
        <anchor feature-key="test" :show-until="showUntil">
          <span>Test anchor</span>
        </anchor>
        <new-feature-popup ref="popup" title="Test title" feature-key="test">
          <p>test content</p>
        </new-feature-popup>
      </div>
    `,
  })

  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('should match snapshot (not in view)', async() => {
    mockIntersectionObserver({
      isFullyInView: false,
    })
    const wrapper = mount(TestNewFeaturePopup, { store, router })
    await Vue.nextTick()

    expect(wrapper.element).toMatchSnapshot()
  })

  it('should match snapshot (in view)', async() => {
    mockIntersectionObserver({
      isFullyInView: true,
    })
    const wrapper = mount(TestNewFeaturePopup, { store, router })
    await Vue.nextTick()

    expect(wrapper.element).toMatchSnapshot()
  })

  it('should close on remind later', async() => {
    mockIntersectionObserver({
      isFullyInView: true,
    })
    const { remindLater } = useNewFeaturePopups()

    const wrapper = mount(TestNewFeaturePopup, { store, router })
    await Vue.nextTick()

    remindLater()
    await Vue.nextTick()

    const popup = wrapper.findComponent(NewFeaturePopup)
    expect(popup.html()).toBe('')
  })

  it('should not show if dismissed', async() => {
    mockIntersectionObserver({
      isFullyInView: true,
    })
    mockLocalStorage.getLocalStorage.mockImplementation(() => ['test'])

    const wrapper = mount(TestNewFeaturePopup, { store, router })
    await Vue.nextTick()

    const popup = wrapper.findComponent(NewFeaturePopup)
    expect(popup.html()).toBe('')
  })
})
