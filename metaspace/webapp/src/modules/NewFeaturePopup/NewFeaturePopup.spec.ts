import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import NewFeaturePopup from './NewFeaturePopup.vue'
import PopupAnchor from './PopupAnchor.vue'
// import useNewFeaturePopups from './useNewFeaturePopups'
import router from '../../router'
import store from '../../store'

import { ref } from 'vue'
import * as useIntersectionObserver from '../../lib/useIntersectionObserver'
// import * as localStorage from '../../lib/localStorage'

vi.mock('popper.js')
vi.mock('../../lib/useIntersectionObserver')
const mockUseIntersectionObserver: any = useIntersectionObserver
vi.mock('../../lib/localStorage')
// const mockLocalStorage : any = localStorage

function mockIntersectionObserver({ isIntersecting = false, isFullyInView = false, intersectionRatio = 0 }) {
  mockUseIntersectionObserver.default.mockImplementation(() => ({
    isIntersecting: ref(isIntersecting),
    isFullyInView: ref(isFullyInView),
    intersectionRatio: ref(intersectionRatio),
    observe: vi.fn(),
    unobserve: vi.fn(),
  }))
}

describe('NewFeaturePopup', () => {
  const TestNewFeaturePopup = {
    components: {
      PopupAnchor, // full name is mocked
      NewFeaturePopup,
    },
    props: ['showUntil'],
    template: `
      <div>
        <PopupAnchor feature-key="test" :show-until="showUntil">
          <span>Test anchor</span>
        </PopupAnchor>
        <NewFeaturePopup ref="popup" title="Test title" feature-key="test">
          <p>test content</p>
        </NewFeaturePopup>
      </div>
    `,
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should match snapshot (not in view)', async () => {
    mockIntersectionObserver({ isFullyInView: false })
    const wrapper = mount(TestNewFeaturePopup, { global: { plugins: [store, router] } })
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('should match snapshot (in view)', async () => {
    mockIntersectionObserver({
      isFullyInView: true,
    })
    const wrapper = mount(TestNewFeaturePopup, { global: { plugins: [store, router] } })
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })

  // TODO: fix this tests
  // it('should close on remind later', async() => {
  //   mockIntersectionObserver({
  //     isFullyInView: true,
  //   })
  //   const { remindLater } = useNewFeaturePopups()
  //
  //   const wrapper = mount(TestNewFeaturePopup, { global: { plugins: [store, router] } })
  //   await nextTick()
  //
  //   remindLater()
  //   await nextTick()
  //
  //   const popup = wrapper.findComponent(NewFeaturePopup)
  //   expect(popup.html()).toBe('')
  // })
})
