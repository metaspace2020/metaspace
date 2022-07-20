import { mount } from '@vue/test-utils'
import GroupsListPage from './GroupsListPage.vue'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import store from '../../store'
import router from '../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'

describe('GroupsListPage', () => {
  const mockGroups = [
    {
      id: 'group1',
      name: 'group1',
      shortName: 'g1',
      numMembers: 2,
      members: [
        {
          role: 'MEMBER',
          user: {
            name: 'user1',
          },
        },
        {
          role: 'MEMBER',
          user: {
            name: 'user2',
          },
        },
      ],
    },
    {
      id: 'group2',
      name: 'group2',
      shortName: 'g2',
      numMembers: 1,
      members: [
        {
          role: 'MEMBER',
          user: {
            name: 'user1',
          },
        },
      ],
    },
  ]

  const adminQuery = () => {
    initMockGraphqlClient({
      Query: () => ({
        currentUser: () => ({ id: 'userid', role: 'admin' }),
        allGroups: () => mockGroups,
      }),
    })
  }

  const userQuery = () => {
    initMockGraphqlClient({
      Query: () => ({
        currentUser: () => ({ id: 'userid', role: 'user' }),
      }),
    })
  }

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
  })

  it('should match snapshot logged as non-admin', async() => {
    userQuery()
    const wrapper = mount(GroupsListPage, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should match snapshot logged as admin', async() => {
    adminQuery()
    const wrapper = mount(GroupsListPage, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should list the correct amount of groups', async() => {
    adminQuery()
    const wrapper = mount(GroupsListPage, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper.findAll('.group-item').length).toBe(2)
  })

  it('should change to create group page after hitting create group', async() => {
    adminQuery()
    router.replace({ path: '/admin/groups' })
    const wrapper = mount(GroupsListPage, { store, router, apolloProvider })
    await Vue.nextTick()

    wrapper.find('.el-button').trigger('click')
    await Vue.nextTick()
    expect(router.currentRoute.path).toBe('/group/create')
  })

  it('should navigate to group manage page', async() => {
    adminQuery()
    router.replace({ path: '/admin/groups' })
    const wrapper = mount(GroupsListPage, { store, router, apolloProvider })
    await Vue.nextTick()

    wrapper.findAll('[data-test-key="manage-link"]').at(0).trigger('click')
    await Vue.nextTick()
    expect(router.currentRoute.name).toBe('group')
    expect(router.currentRoute.params.groupIdOrSlug).toBe(mockGroups[0].id)

    router.replace({ path: '/admin/groups' })
    wrapper.findAll('[data-test-key="manage-link"]').at(1).trigger('click')
    await Vue.nextTick()
    expect(router.currentRoute.name).toBe('group')
    expect(router.currentRoute.params.groupIdOrSlug).toBe(mockGroups[1].id)
  })

  it('should navigate to browse dataset page', async() => {
    adminQuery()
    router.replace({ path: '/admin/groups' })
    const wrapper = mount(GroupsListPage, { store, router, apolloProvider })
    await Vue.nextTick()

    wrapper.findAll('[data-test-key="dataset-link"]').at(0).trigger('click')
    await Vue.nextTick()
    expect(router.currentRoute.path).toBe('/datasets')
    expect(router.currentRoute.query.grp).toBe(mockGroups[0].id)

    router.replace({ path: '/admin/groups' })
    wrapper.findAll('[data-test-key="dataset-link"]').at(1).trigger('click')
    await Vue.nextTick()
    expect(router.currentRoute.path).toBe('/datasets')
    expect(router.currentRoute.query.grp).toBe(mockGroups[1].id)
  })
})
