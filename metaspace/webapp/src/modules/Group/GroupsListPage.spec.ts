import { mount } from '@vue/test-utils'
import GroupsListPage from './GroupsListPage'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import store from '../../store'
import router from '../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'
import { UserGroupRoleOptions } from '../../api/group'

describe('GroupsListPage', () => {
  const mockGroups = [
    {
      id: 'group1',
      name: 'group1',
      shortName: 'g1',
      numMembers: 2,
      urlSlug: 'grp1',
      currentUserRole: UserGroupRoleOptions.GROUP_ADMIN,
    },
    {
      id: 'group2',
      name: 'group2',
      shortName: 'g2',
      numMembers: 1,
      urlSlug: 'grp3',
      currentUserRole: UserGroupRoleOptions.MEMBER,
    },
  ]

  const testHarness = Vue.extend({
    components: {
      GroupsListPage,
    },
    render(h) {
      return h(GroupsListPage, { props: this.$attrs })
    },
  })

  const userQuery = () => {
    initMockGraphqlClient({
      Query: () => ({
        currentUser: () => ({ id: 'userid', role: 'user' }),
        allGroups: () => mockGroups,
      }),
    })
  }

  const userNoDataQuery = () => {
    initMockGraphqlClient({
      Query: () => ({
        currentUser: () => ({ id: 'userid', role: 'user' }),
        allGroups: () => [],
      }),
    })
  }

  const noUserQuery = () => {
    initMockGraphqlClient({
      Query: () => ({
        currentUser: () => null,
      }),
    })
  }

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
  })

  beforeEach(() => {
    userQuery()
  })

  it('should match snapshot not logged', async() => {
    noUserQuery()
    const wrapper = mount(testHarness, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should match snapshot no data', async() => {
    userNoDataQuery()
    const wrapper = mount(testHarness, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should match snapshot logged', async() => {
    const wrapper = mount(testHarness, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should list the correct amount of groups', async() => {
    const wrapper = mount(testHarness, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper.findAll('.group-item').length).toBe(2)
  })

  it('should change to create group page after hitting create group', async() => {
    router.replace({ path: '/groups' })
    const wrapper = mount(testHarness, { store, router, apolloProvider })
    await Vue.nextTick()

    wrapper.find('.el-button').trigger('click')
    await Vue.nextTick()
    expect(router.currentRoute.path).toBe('/group/create')
  })

  it('should navigate to group manage page', async() => {
    router.replace({ path: '/groups' })
    const wrapper = mount(testHarness, { store, router, apolloProvider })
    await Vue.nextTick()

    wrapper.findAll('[dataTestKey="manage-link"]').at(0).trigger('click')
    await Vue.nextTick()
    expect(router.currentRoute.name).toBe('group')
    expect(router.currentRoute.params.groupIdOrSlug).toBe(mockGroups[0].urlSlug)

    router.replace({ path: '/groups' })
    wrapper.findAll('[dataTestKey="manage-link"]').at(1).trigger('click')
    await Vue.nextTick()
    expect(router.currentRoute.name).toBe('group')
    expect(router.currentRoute.params.groupIdOrSlug).toBe(mockGroups[1].urlSlug)
  })

  it('should navigate to browse dataset page', async() => {
    router.replace({ path: '/groups' })
    const wrapper = mount(testHarness, { store, router, apolloProvider })
    await Vue.nextTick()

    wrapper.findAll('[dataTestKey="dataset-link"]').at(0).trigger('click')
    await Vue.nextTick()
    expect(router.currentRoute.path).toBe('/datasets')
    expect(router.currentRoute.query.grp).toBe(mockGroups[0].id)

    router.replace({ path: '/groups' })
    wrapper.findAll('[dataTestKey="dataset-link"]').at(1).trigger('click')
    await Vue.nextTick()
    expect(router.currentRoute.path).toBe('/datasets')
    expect(router.currentRoute.query.grp).toBe(mockGroups[1].id)
  })
})
