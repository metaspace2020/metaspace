import { mount, Stubs } from '@vue/test-utils'
import Vue from 'vue'
import ViewProjectPage from './ViewProjectPage.vue'
import router from '../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'
import { mockGenerateId, resetGenerateId } from '../../../tests/utils/mockGenerateId'

describe('ViewProjectPage', () => {
  const mockMembersForManagers = [
    {
      role: 'MANAGER',
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
  const mockMembersForMembers = mockMembersForManagers.map(m => ({ ...m, user: { ...m.user, email: null } }))
  const mockMembersForPublic = mockMembersForMembers.filter(m => m.role === 'MANAGER')

  const mockProject = {
    id: '00000000-1111-2222-3333-444444444444',
    name: 'project name',
    shortName: 'projectShortName',
    urlSlug: null,
    currentUserRole: null,
    numMembers: 2,
    members: mockMembersForPublic,
    projectDescription: null,
    publicationStatus: 'UNPUBLISHED',
  }
  const mockProjectFn = jest.fn((src: any, args: any, ctx: any, info: any): any => mockProject)
  const graphqlMocks = {
    Query: () => ({
      currentUser: () => ({ id: 'userid' }),
      project: mockProjectFn,
      projectByUrlSlug: mockProjectFn,
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
  }
  const stubsWithMembersList: Stubs = {
    ...stubs,
    ProjectMembersList: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    router.replace({ name: 'project', params: { projectIdOrSlug: mockProject.id } })
  })

  describe('datasets tab', () => {
    beforeEach(() => {
      router.replace({ query: { tab: 'datasets' } })
    })

    it('should match snapshot (non-member)', async() => {
      initMockGraphqlClient(graphqlMocks)
      const maxVisibleDatasets = 3
      const wrapper = mount(ViewProjectPage, { router, stubs, apolloProvider })
      wrapper.setData({ maxVisibleDatasets }) // Also test that the datasets list is correctly clipped
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()

      expect(wrapper.findAll('button').wrappers.map(w => w.text()))
        .toEqual(expect.arrayContaining(['Request access']))
      expect(wrapper.findAll('[role="tab"]').wrappers.map(w => w.text()))
        .toEqual(['Datasets (4)', 'Members (2)'])
      expect(wrapper.findAll('.dataset-list > *')).toHaveLength(maxVisibleDatasets)
    })
  })

  describe('members tab', () => {
    beforeEach(() => {
      router.replace({ query: { tab: 'members' } })
    })

    it('should match snapshot (non-member)', async() => {
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewProjectPage, { router, stubs: stubsWithMembersList, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })

    it('should match snapshot (invited)', async() => {
      mockProjectFn.mockImplementation(() => ({ ...mockProject, currentUserRole: 'INVITED' }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewProjectPage, { router, stubs: stubsWithMembersList, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })

    it('should match snapshot (member)', async() => {
      mockProjectFn.mockImplementation(() =>
        ({ ...mockProject, currentUserRole: 'MEMBER', members: mockMembersForMembers }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewProjectPage, { router, stubs: stubsWithMembersList, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })

    it('should match snapshot (manager, including table)', async() => {
      mockProjectFn.mockImplementation(() =>
        ({ ...mockProject, currentUserRole: 'MANAGER', members: mockMembersForManagers }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewProjectPage, { router, stubs, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })
  })

  describe('settings tab', () => {
    beforeEach(() => {
      router.replace({ query: { tab: 'settings' } })
    })

    it('should match snapshot', async() => {
      mockProjectFn.mockImplementation(() => ({ ...mockProject, currentUserRole: 'MANAGER' }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewProjectPage, { router, stubs, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })

    it('should disable actions when under review', async() => {
      mockProjectFn.mockImplementation(() => ({
        ...mockProject, currentUserRole: 'MANAGER', publicationStatus: 'UNDER_REVIEW',
      }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewProjectPage, { router, stubs, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })

    it('should disable actions when published', async() => {
      mockProjectFn.mockImplementation(() => ({
        ...mockProject, currentUserRole: 'MANAGER', publicationStatus: 'PUBLISHED',
      }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewProjectPage, { router, stubs, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })
  })

  it('should correctly fetch data and update the route if the project has a urlSlug but is accessed by ID', async() => {
    const urlSlug = 'project-url-slug'
    mockProjectFn.mockImplementation(() => ({ ...mockProject, urlSlug }))
    initMockGraphqlClient(graphqlMocks)

    const wrapper = mount(ViewProjectPage, { router, stubs, apolloProvider })
    await Vue.nextTick()

    expect(router.currentRoute.params.projectIdOrSlug).toEqual(urlSlug)
    // Assert that the correct graphql calls were made. See the GraphQLFieldResolver type for details on the args here
    expect(mockProjectFn).toHaveBeenCalledTimes(2)
    expect(mockProjectFn.mock.calls[0][1].projectId).toEqual(mockProject.id)
    expect(mockProjectFn.mock.calls[0][3].fieldName).toEqual('project')
    expect(mockProjectFn.mock.calls[1][1].urlSlug).toEqual(urlSlug)
    expect(mockProjectFn.mock.calls[1][3].fieldName).toEqual('projectByUrlSlug')
  })

  describe('publishing tab', () => {
    beforeEach(() => {
      router.replace({ query: { tab: 'publishing' } })
      resetGenerateId()
    })

    it('should match snapshot (unpublished)', async() => {
      mockGenerateId(123)
      mockProjectFn.mockImplementation(() => ({ ...mockProject, currentUserRole: 'MANAGER' }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewProjectPage, { router, stubs, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })

    it('should match snapshot (under review)', async() => {
      mockProjectFn.mockImplementation(() => ({
        ...mockProject, currentUserRole: 'MANAGER', publicationStatus: 'UNDER_REVIEW',
      }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewProjectPage, { router, stubs, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })

    it('should match snapshot (published)', async() => {
      mockProjectFn.mockImplementation(() => ({
        ...mockProject, currentUserRole: 'MANAGER', publicationStatus: 'PUBLISHED',
      }))
      initMockGraphqlClient(graphqlMocks)
      const wrapper = mount(ViewProjectPage, { router, stubs, apolloProvider })
      await Vue.nextTick()

      expect(wrapper).toMatchSnapshot()
    })
  })
})
