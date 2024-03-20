import { defineComponent, nextTick, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import GroupsListPage from './GroupsListPage'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
import { UserGroupRoleOptions } from '../../api/group'
import { vi } from 'vitest'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import store from '../../store'
import router from '../../router'
import { encodeParams } from '../Filters'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))

let mockRoutePush

let graphqlMocks: any

describe('GroupsListItem', () => {
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

  const testHarness = defineComponent({
    components: {
      GroupsListPage,
    },
    props: ['className'],
    setup(props) {
      return () => h(GroupsListPage, { ...props })
    },
  })

  const userQuery = async () => {
    const params = {
      currentUser: () => ({ id: 'userid', role: 'user' }),
      allGroups: () => mockGroups,
    }

    graphqlMocks = await initMockGraphqlClient({
      Query: () => params,
    })
    ;(useQuery as any).mockReturnValue({
      result: ref(Object.keys(params).reduce((acc, key) => ({ ...acc, [key]: params[key]() }), {})),
      loading: ref(false),
      onResult: vi.fn(),
    })
  }
  const userNoDataQuery = async () => {
    const params = {
      currentUser: () => ({ id: 'userid', role: 'user' }),
      allGroups: () => [],
    }

    graphqlMocks = await initMockGraphqlClient({
      Query: () => params,
    })
    ;(useQuery as any).mockReturnValue({
      result: ref(Object.keys(params).reduce((acc, key) => ({ ...acc, [key]: params[key]() }), {})),
      loading: ref(false),
      onResult: vi.fn(),
    })
  }

  const noUserQuery = async () => {
    const params = {
      currentUser: () => null,
    }

    graphqlMocks = await initMockGraphqlClient({
      Query: () => params,
    })
    ;(useQuery as any).mockReturnValue({
      result: ref(Object.keys(params).reduce((acc, key) => ({ ...acc, [key]: params[key]() }), {})),
      loading: ref(false),
      onResult: vi.fn(),
    })
  }

  beforeEach(() => {
    mockRoutePush = vi.fn()
    vi.mock('vue-router', async () => {
      const actual: any = await vi.importActual('vue-router')
      return {
        ...actual,
        useRouter: () => {
          return {
            push: mockRoutePush,
          }
        },
      }
    })
  })

  beforeEach(async () => {
    await userQuery()
  })

  afterAll(() => {
    vi.clearAllMocks()
  })

  it('should match snapshot not logged', async () => {
    await noUserQuery()
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('should match snapshot no data', async () => {
    await userNoDataQuery()
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('should match snapshot logged', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('should list the correct amount of groups', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.findAll('.group-item').length).toBe(2)
  })

  it('should change to create group page after hitting create group', async () => {
    await router.replace({ path: '/groups' })
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()

    await wrapper.find('.el-button').trigger('click')
    await nextTick()
    expect(mockRoutePush).toHaveBeenCalledWith('/group/create')
  })

  it('should navigate to group manage page', async () => {
    await router.replace({ path: '/groups' })
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()

    wrapper.findAll('[data-test-key="manage-link"]').at(0).trigger('click')
    await nextTick()
    expect(mockRoutePush).toHaveBeenCalledWith({
      name: 'group',
      params: { groupIdOrSlug: mockGroups[0].urlSlug },
      query: { tab: 'settings' },
    })

    await router.replace({ path: '/groups' })
    wrapper.findAll('[data-test-key="manage-link"]').at(1).trigger('click')
    await nextTick()
    expect(mockRoutePush).toHaveBeenCalledWith({
      name: 'group',
      params: { groupIdOrSlug: mockGroups[1].urlSlug },
      query: { tab: 'members' },
    })
  })

  it('should navigate to browse dataset page', async () => {
    await router.replace({ path: '/groups' })
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })
    await flushPromises()
    await nextTick()

    wrapper.findAll('[data-test-key="dataset-link"]').at(0).trigger('click')
    await nextTick()
    expect(mockRoutePush).toHaveBeenCalledWith({
      path: '/datasets',
      query: encodeParams({ group: mockGroups[0].id }),
    })

    await router.replace({ path: '/groups' })
    wrapper.findAll('[data-test-key="dataset-link"]').at(1).trigger('click')
    await nextTick()
    expect(mockRoutePush).toHaveBeenCalledWith({
      path: '/datasets',
      query: encodeParams({ group: mockGroups[1].id }),
    })
  })
})
