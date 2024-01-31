import { mount, shallowMount } from '@vue/test-utils'
import PublicationsPage from './PublicationsPage'
import router from '../../router'
import store from '../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'

describe('PublicationsPage', () => {
  const graphqlWithData = () => {
    initMockGraphqlClient({
      Query: () => ({
        publicationCount: () => {
          return 1
        },
        reviewCount: () => {
          return 10
        },
      }),
    })
  }

  const testHarness = Vue.extend({
    components: {
      PublicationsPage,
    },
    render(h) {
      return h(PublicationsPage, { props: this.$attrs })
    },
  })

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
    graphqlWithData()
  })

  it('should match snapshot', async() => {
    const wrapper = shallowMount(testHarness, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })
})
