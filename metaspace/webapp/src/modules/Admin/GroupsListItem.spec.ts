import { mount } from '@vue/test-utils'
import GroupsListItem from './GroupsListItem.vue'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import store from '../../store'
import router from '../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'

describe('GroupsListItem', () => {
  const propsData = {
    id: 'group1',
    group:
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
  }

  const countQuery = () => {
    initMockGraphqlClient({
      Query: () => ({
        countDatasets: () => 1,
      }),
    })
  }

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
  })

  it('should match snapshot logged as non-admin', async() => {
    countQuery()
    const wrapper = mount(GroupsListItem, { store, router, apolloProvider, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should render the correct navigation links', async() => {
    countQuery()
    const wrapper = mount(GroupsListItem, { store, router, apolloProvider, propsData })
    await Vue.nextTick()

    expect(wrapper.find('[data-test-key="manage-link"]').attributes('href'))
      .toBe(`/group/${propsData.id}?tab=settings`)
    expect(wrapper.find('[data-test-key="dataset-link"]').attributes('href'))
      .toBe(`/datasets?grp=${propsData.id}`)
  })
})
