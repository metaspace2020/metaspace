import { mount } from '@vue/test-utils'
import Vue from 'vue'
import NewFeaturePopup from './NewFeaturePopup.vue'
import router from '../../router'
import store from '../../store'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'

// for mocks
import { ref } from '@vue/composition-api'
import * as useIntersectionObserver from '../../lib/useIntersectionObserver'

Vue.use(Vuex)
sync(store, router)

jest.mock('popper.js')

jest.mock('../../lib/useIntersectionObserver')
const mockUseIntersectionObserver = useIntersectionObserver as jest.Mocked<typeof useIntersectionObserver>

// Popper.js doesn't work in JSDom, maybe?
describe('NewFeaturePopup', () => {
  const TestNewFeaturePopup = Vue.component('test-new-feature-popup', {
    components: { nfp: NewFeaturePopup }, // full name is mocked
    props: ['name', 'title', 'showUntil'],
    template: `
      <nfp :title="title">
        <p>test content</p>
        <span slot="reference">test</span>
      </nfp>
    `,
  })

  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('should match snapshot', async() => {
    mockUseIntersectionObserver.default.mockImplementation(() => ({
      isIntersecting: ref(true),
      isFullyInView: ref(true),
      intersectionRatio: ref(1),
      observe: jest.fn(),
      unobserve: jest.fn(),
    }))
    const wrapper = mount(TestNewFeaturePopup, { store, router, propsData: { title: 'Test' } })
    await Vue.nextTick()

    expect(wrapper.element).toMatchSnapshot()
  })
})
