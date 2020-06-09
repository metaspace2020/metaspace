import { mount } from '@vue/test-utils'
import MetaspaceHeader from './MetaspaceHeader.vue'
import router from '../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'
import store from '../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'

Vue.use(Vuex)
sync(store, router)

describe('MetaspaceHeader', () => {
  it('should match snapshot (logged out)', async() => {
    initMockGraphqlClient({
      Query: () => ({
        currentUser: () => null, // Prevent automatic mocking
      }),
    })
    const wrapper = mount(MetaspaceHeader, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should match snapshot (logged in)', async() => {
    initMockGraphqlClient({
      Query: () => ({
        currentUser: () => ({
          id: '123',
          name: 'Test User',
          email: 'test@example.com',
          primaryGroup: {
            group: {
              id: '456',
              name: 'Test Group',
              urlSlug: null,
            },
          },
          groups: [
            { role: 'MEMBER', group: { hasPendingRequest: null } },
            { role: 'GROUP_ADMIN', group: { hasPendingRequest: false } },
          ],
          projects: [
            { role: 'PENDING', project: { hasPendingRequest: null } },
            { role: 'MANAGER', project: { hasPendingRequest: true } },
          ],
        }),
      }),
    })
    const wrapper = mount(MetaspaceHeader, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should include current filters in annotations & dataset links', async() => {
    initMockGraphqlClient({})
    router.push({ path: '/annotations', query: { db_id: '22', organism: 'human' } })
    const wrapper = mount(MetaspaceHeader, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper.find('#annotations-link').attributes().href).toEqual('/annotations?db_id=22&organism=human')
    expect(wrapper.find('#datasets-link').attributes().href).toEqual('/datasets?organism=human') // db isn't a valid filter for datasets
  })
})
