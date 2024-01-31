import { mount } from '@vue/test-utils'
import router from '../../router'
import store from '../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import GroupsListItem from './GroupsListItem'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'
import { UserGroupRoleOptions } from '../../api/group'

describe('GroupsListItem', () => {
  const propsData = {
    id: 'gr1',
    name: 'Group 1',
    shortName: 'grp1',
    urlSlug: 'grp1',
    numMembers: 1,
    currentUserRole: UserGroupRoleOptions.GROUP_ADMIN,
  }

  const testHarness = Vue.extend({
    components: {
      GroupsListItem,
    },
    render(h) {
      return h(GroupsListItem, { props: this.$attrs })
    },
  })

  const graphqlWithData = () => {
    initMockGraphqlClient({
      Query: () => ({
        countDatasets: () => {
          return 1
        },
      }),
    })
  }

  const graphqlWithNoData = () => {
    initMockGraphqlClient({
      Query: () => ({
        countDatasets: () => {
          return 0
        },
      }),
    })
  }

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
    graphqlWithData()
  })

  it('it should match snapshot with one member and admin role', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('it should match snapshot with two members and admin role', async() => {
    const wrapper = mount(testHarness, { store, router, propsData: { ...propsData, numMembers: 2 } })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('it should match snapshot with two members and not admin role', async() => {
    const wrapper = mount(testHarness, {
      store,
      router,
      propsData: {
        ...propsData,
        currentUserRole: UserGroupRoleOptions.MEMBER,
      },
    })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('it should match snapshot with two members, not admin role and 0 datasets', async() => {
    graphqlWithNoData()
    const wrapper = mount(testHarness, {
      store,
      router,
      propsData: {
        ...propsData,
        currentUserRole: UserGroupRoleOptions.MEMBER,
      },
    })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should render the correct navigation links if admin', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper.find('[dataTestKey="group-link"]').attributes('href'))
      .toBe(`/group/${propsData.urlSlug}`)
    expect(wrapper.find('[dataTestKey="manage-link"]').attributes('href'))
      .toBe(`/group/${propsData.urlSlug}?tab=settings`)
    expect(wrapper.find('[dataTestKey="dataset-link"]').attributes('href'))
      .toBe(`/datasets?grp=${propsData.id}`)
  })

  it('should render the correct navigation links if not admin', async() => {
    const wrapper = mount(testHarness, {
      store,
      router,
      propsData: {
        ...propsData,
        currentUserRole: UserGroupRoleOptions.MEMBER,
      },
    })
    await Vue.nextTick()

    expect(wrapper.find('[dataTestKey="group-link"]').attributes('href'))
      .toBe(`/group/${propsData.urlSlug}`)
    expect(wrapper.find('[dataTestKey="manage-link"]').attributes('href'))
      .toBe(`/group/${propsData.urlSlug}?tab=members`)
    expect(wrapper.find('[dataTestKey="dataset-link"]').attributes('href'))
      .toBe(`/datasets?grp=${propsData.id}`)
  })
})
