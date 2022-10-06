import { mount, Stubs } from '@vue/test-utils'
import Vue from 'vue'
import ViewGroupPage from './ViewGroupPage.vue'
import router from '../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'

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
  const mockMembersForMembers = mockMembersForAdmins.map(m => ({ ...m, user: { ...m.user, email: null } }))
  const mockMembersForPublic = mockMembersForMembers.filter(m => m.role === 'GROUP_ADMIN')

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

  const mockGroupFn = jest.fn((src: any, args: any, ctx: any, info: any): any => mockGroup)
  const graphqlMocks = {
    Query: () => ({
      currentUser: () => ({ id: 'userid' }),
      group: mockGroupFn,
      groupByUrlSlug: mockGroupFn,
      allDatasets: () => ([
        { id: 'datasetId1', name: 'dataset name 1', status: 'FINISHED' },
        { id: 'datasetId2', name: 'dataset name 2', status: 'QUEUED' },
        { id: 'datasetId3', name: 'dataset name 3', status: 'ANNOTATING' },
        { id: 'datasetId4', name: 'dataset name 4', status: 'FINISHED' },
      ]),
      countDatasets: () => 4,
    }),
  }

  const stubs: Stubs = {
    DatasetItem: true,
    MolecularDatabases: true,
  }
  const stubsWithMembersList: Stubs = {
    ...stubs,
    GroupMembersList: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    router.replace({ name: 'group', params: { groupIdOrSlug: mockGroup.id } })
  })

  describe('datasets tab', () => {
    beforeEach(() => {
      router.replace({ query: { tab: 'datasets' } })
    })

    it('should match snapshot (non-member)', async() => {
      initMockGraphqlClient(graphqlMocks)
      const maxVisibleDatasets = 3
      const wrapper = mount(ViewGroupPage, { router, stubs, apolloProvider })
      wrapper.setData({ maxVisibleDatasets }) // Also test that the datasets list is correctly clipped
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()

      expect(wrapper.findAll('button').wrappers.map(w => w.text()))
        .toEqual(expect.arrayContaining(['Request access']))
      expect(wrapper.findAll('[role="tab"]').wrappers.map(w => w.text()))
        .toEqual(['Description', 'Datasets (4)', 'Members (2)'])
      expect(wrapper.findAll('.dataset-list > *')).toHaveLength(maxVisibleDatasets)
    })
  })

  describe('members tab', () => {
    beforeEach(() => {
      router.replace({ query: { tab: 'members' } })
    })

    it('should match snapshot (non-member)', async() => {
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewGroupPage, { router, stubs: stubsWithMembersList, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })

    it('should match snapshot (invited)', async() => {
      mockGroupFn.mockImplementation(() => ({ ...mockGroup, currentUserRole: 'INVITED' }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewGroupPage, { router, stubs: stubsWithMembersList, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })

    it('should match snapshot (member)', async() => {
      mockGroupFn.mockImplementation(() =>
        ({ ...mockGroup, currentUserRole: 'MEMBER', members: mockMembersForMembers }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewGroupPage, { router, stubs: stubsWithMembersList, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })

    it('should match snapshot (manager, including table)', async() => {
      mockGroupFn.mockImplementation(() =>
        ({ ...mockGroup, currentUserRole: 'GROUP_ADMIN', members: mockMembersForAdmins }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewGroupPage, { router, stubs, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })
  })

  describe('settings tab', () => {
    beforeEach(() => {
      router.replace({ query: { tab: 'settings' } })
    })

    it('should match snapshot', async() => {
      mockGroupFn.mockImplementation(() => ({ ...mockGroup, currentUserRole: 'GROUP_ADMIN' }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewGroupPage, { router, stubs, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })
  })

  it('should correctly fetch data and update the route if the group has a urlSlug but is accessed by ID', async() => {
    const urlSlug = 'group-url-slug'
    mockGroupFn.mockImplementation(() => ({ ...mockGroup, urlSlug }))
    initMockGraphqlClient(graphqlMocks)

    const wrapper = mount(ViewGroupPage, { router, stubs, apolloProvider })
    await Vue.nextTick()

    expect(router.currentRoute.params.groupIdOrSlug).toEqual(urlSlug)
    // Assert that the correct graphql calls were made. See the GraphQLFieldResolver type for details on the args here
    expect(mockGroupFn).toHaveBeenCalledTimes(2)
    expect(mockGroupFn.mock.calls[0][1].groupId).toEqual(mockGroup.id)
    expect(mockGroupFn.mock.calls[0][3].fieldName).toEqual('group')
    expect(mockGroupFn.mock.calls[1][1].urlSlug).toEqual(urlSlug)
    expect(mockGroupFn.mock.calls[1][3].fieldName).toEqual('groupByUrlSlug')
  })
})
