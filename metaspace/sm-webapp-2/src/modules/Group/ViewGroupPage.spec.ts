import { nextTick, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ViewGroupPage from './ViewGroupPage.vue'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
import { vi } from 'vitest'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import router from '../../router'
import store from '../../store'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))

let graphqlMocks: any

describe('ViewGroupPage', () => {
  const mockMembersForAdmins = [
    {
      role: 'GROUP_ADMIN',
      numDatasets: 123,
      user: { id: '3', name: 'me', email: 'my-email@example.com' },
    },
    {
      role: 'PENDING',
      numDatasets: 0,
      user: { id: '4', name: 'Person who asked to join', email: 'access@requestor.com' },
    },
    {
      role: 'INVITED',
      numDatasets: 0,
      user: { id: '5', name: 'Invitee', email: 'awaiting@response.com' },
    },
    {
      role: 'MEMBER',
      numDatasets: 1,
      user: { id: '6', name: 'Project member', email: 'person@embl.de' },
    },
  ]
  const mockMembersForMembers = mockMembersForAdmins.map((m) => ({ ...m, user: { ...m.user, email: null } }))
  const mockMembersForPublic = mockMembersForMembers.filter((m) => m.role === 'GROUP_ADMIN')
  const mockGroup = {
    id: '00000000-1111-2222-3333-444444444444',
    name: 'group name',
    shortName: 'groupShortName',
    urlSlug: null,
    currentUserRole: null,
    numMembers: 2,
    members: mockMembersForPublic,
    numDatabases: 2,
  }
  const mockGroupFn = vi.fn((): any => mockGroup)
  const stubs = {
    DatasetItem: {
      template: '<div class="mock-ds-item"><slot></slot></div>',
      props: ['dataset'],
    },
    MolecularDatabases: {
      template: '<div class="mock-mol-dbs"><slot></slot></div>',
      props: ['canDelete', 'groupId'],
    },
    ElTable: {
      template: '<div class="mock-el-table"><slot></slot></div>',
      props: ['data', 'columns', 'tableId'], // include other props as necessary
    },
    ElTableColumn: {
      template: '<div class="mock-el-table-column"><slot></slot></div>',
      props: ['data', 'columns', 'tableId'], // include other props as necessary
    },
  }
  const stubsWithMembersList = {
    ...stubs,
    GroupMembersList: {
      template: '<div class="mock-prj-members-item"><slot></slot></div>',
    },
  }
  const defaultParams = {
    currentUser: () => ({ id: 'userid' }),
    group: mockGroupFn,
    groupByUrlSlug: mockGroupFn,
    allDatasets: () => [
      { id: 'datasetId1', name: 'dataset name 1', status: 'FINISHED' },
      { id: 'datasetId2', name: 'dataset name 2', status: 'QUEUED' },
      { id: 'datasetId3', name: 'dataset name 3', status: 'ANNOTATING' },
      { id: 'datasetId4', name: 'dataset name 4', status: 'FINISHED' },
    ],
    countDatasets: () => 4,
  }
  const mockGraphql = async (params) => {
    graphqlMocks = await initMockGraphqlClient({
      Query: () => params,
    })
    ;(useQuery as any).mockReturnValue({
      result: ref(Object.keys(params).reduce((acc, key) => ({ ...acc, [key]: params[key]() }), {})),
      loading: ref(false),
      onResult: vi.fn(),
    })
  }

  beforeAll(async () => {
    await mockGraphql(defaultParams)
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await router.replace({ name: 'group', params: { groupIdOrSlug: mockGroup.id } })
  })

  describe('datasets tab', () => {
    beforeEach(async () => {
      await router.replace({ query: { tab: 'datasets' } })
    })

    it('should match snapshot (non-member)', async () => {
      const wrapper = mount(ViewGroupPage, {
        global: {
          plugins: [store, router],
          provide: {
            [DefaultApolloClient]: graphqlMocks,
          },
          stubs,
        },
      })

      await flushPromises()
      await nextTick()

      expect(wrapper.html()).toMatchSnapshot()
      expect(wrapper.findAll('button').map((w) => w.text())).toEqual(expect.arrayContaining(['Request access']))
      expect(wrapper.findAll('[role="tab"]').map((w) => w.text())).toEqual([
        'Description',
        'Datasets (4)',
        'Members (2)',
      ])
    })
  })

  describe('members tab', () => {
    beforeEach(async () => {
      await router.replace({ query: { tab: 'members' } })
    })

    it('should match snapshot (non-member)', async () => {
      const wrapper = mount(ViewGroupPage, {
        global: {
          plugins: [store, router],
          provide: {
            [DefaultApolloClient]: graphqlMocks,
          },
          stubs: stubsWithMembersList,
        },
      })

      await flushPromises()
      await nextTick()

      expect(wrapper.html()).toMatchSnapshot()
    })

    it('should match snapshot (invited)', async () => {
      const customValue = { ...mockGroup, currentUserRole: 'INVITED' }
      const customParams = {
        group: () => customValue,
        groupByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewGroupPage, {
        global: {
          plugins: [store, router],
          provide: {
            [DefaultApolloClient]: graphqlMocks,
          },
          stubs: stubsWithMembersList,
        },
      })

      await flushPromises()
      await nextTick()

      expect(wrapper.html()).toMatchSnapshot()
    })

    it('should match snapshot (member)', async () => {
      const customValue = { ...mockGroup, currentUserRole: 'MEMBER', members: mockMembersForMembers }
      const customParams = {
        group: () => customValue,
        groupByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewGroupPage, {
        global: {
          plugins: [store, router],
          provide: {
            [DefaultApolloClient]: graphqlMocks,
          },
          stubs: stubsWithMembersList,
        },
      })

      await flushPromises()
      await nextTick()

      expect(wrapper.html()).toMatchSnapshot()
    })

    it('should match snapshot (manager, including table)', async () => {
      const customValue = { ...mockGroup, currentUserRole: 'GROUP_ADMIN', members: mockMembersForAdmins }
      const customParams = {
        group: () => customValue,
        groupByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewGroupPage, {
        global: {
          plugins: [store, router],
          provide: {
            [DefaultApolloClient]: graphqlMocks,
          },
          stubs,
        },
      })

      await flushPromises()
      await nextTick()

      expect(wrapper.html()).toMatchSnapshot()
    })
  })

  describe('settings tab', () => {
    beforeEach(async () => {
      await router.replace({ query: { tab: 'settings' } })
    })

    it('should match snapshot', async () => {
      const customValue = { ...mockGroup, currentUserRole: 'MANAGER' }
      const customParams = {
        group: () => customValue,
        groupByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewGroupPage, {
        global: {
          plugins: [store, router],
          provide: {
            [DefaultApolloClient]: graphqlMocks,
          },
          stubs,
        },
      })

      await flushPromises()
      await nextTick()

      expect(wrapper.html()).toMatchSnapshot()
    })

    it('should disable actions when under review', async () => {
      const customValue = { ...mockGroup, currentUserRole: 'MANAGER', publicationStatus: 'UNDER_REVIEW' }
      const customParams = {
        group: () => customValue,
        groupByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewGroupPage, {
        global: {
          plugins: [store, router],
          provide: {
            [DefaultApolloClient]: graphqlMocks,
          },
          stubs,
        },
      })

      await flushPromises()
      await nextTick()

      expect(wrapper.html()).toMatchSnapshot()
    })

    it('should disable actions when under published', async () => {
      const customValue = { ...mockGroup, currentUserRole: 'MANAGER', publicationStatus: 'PUBLISHED' }
      const customParams = {
        group: () => customValue,
        groupByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewGroupPage, {
        global: {
          plugins: [store, router],
          provide: {
            [DefaultApolloClient]: graphqlMocks,
          },
          stubs,
        },
      })

      await flushPromises()
      await nextTick()

      expect(wrapper.html()).toMatchSnapshot()
    })
  })

  it('should correctly fetch data and update the route if the group has a urlSlug but is accessed by ID', async () => {
    const urlSlug = 'group-url-slug'
    const mockGroupFn: any = vi.fn(() => ({ ...mockGroup, urlSlug }))
    await router.replace({ name: 'group', params: { groupIdOrSlug: urlSlug } })
    const customParams = {
      group: mockGroupFn,
      groupByUrlSlug: mockGroupFn,
    }
    await mockGraphql({
      ...defaultParams,
      ...customParams,
    })

    const wrapper = mount(ViewGroupPage, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
        stubs,
      },
    })

    await flushPromises()
    await nextTick()

    expect(router.currentRoute.value.params.groupIdOrSlug).toEqual(urlSlug)
    // Assert that the correct graphql calls were made. See the GraphQLFieldResolver type for details on the args here
    expect(mockGroupFn).toHaveBeenCalledTimes(2)
    expect(wrapper.vm.groupId).toEqual(mockGroup.id)
    expect(wrapper.vm.groupSlug).toEqual(urlSlug)
  })

  describe('publishing tab', () => {
    beforeEach(async () => {
      await router.replace({ query: { tab: 'publishing' } })
    })

    it('should match snapshot (unpublished)', async () => {
      const customValue = { ...mockGroup, currentUserRole: 'MANAGER' }
      const customParams = {
        group: () => customValue,
        groupByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewGroupPage, {
        global: {
          plugins: [store, router],
          provide: {
            [DefaultApolloClient]: graphqlMocks,
          },
          stubs,
        },
      })

      await flushPromises()
      await nextTick()

      expect(wrapper.html()).toMatchSnapshot()
    })

    it('should match snapshot (under review)', async () => {
      const customValue = { ...mockGroup, currentUserRole: 'MANAGER', publicationStatus: 'UNDER_REVIEW' }
      const customParams = {
        group: () => customValue,
        groupByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewGroupPage, {
        global: {
          plugins: [store, router],
          provide: {
            [DefaultApolloClient]: graphqlMocks,
          },
          stubs,
        },
      })

      await flushPromises()
      await nextTick()

      expect(wrapper.html()).toMatchSnapshot()
    })

    it('should match snapshot (published)', async () => {
      const customValue = { ...mockGroup, currentUserRole: 'MANAGER', publicationStatus: 'PUBLISHED' }
      const customParams = {
        group: () => customValue,
        groupByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewGroupPage, {
        global: {
          plugins: [store, router],
          provide: {
            [DefaultApolloClient]: graphqlMocks,
          },
          stubs,
        },
      })

      await flushPromises()
      await nextTick()

      expect(wrapper.html()).toMatchSnapshot()
    })
  })
})
