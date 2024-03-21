import { nextTick, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ViewProjectPage from './ViewProjectPage.vue'
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

vi.mock('@element-plus/icons-vue', async () => {
  const actual = await vi.importActual('@element-plus/icons-vue') // Import the actual module
  return {
    ...actual,
    Loading: {
      default: {
        name: 'LoadingMock',
        template: '<div>Loading...</div>', // Simplified mock of the Loading component
      },
    },
  }
})

let graphqlMocks: any

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
  const mockMembersForMembers = mockMembersForManagers.map((m) => ({ ...m, user: { ...m.user, email: null } }))
  const mockMembersForPublic = mockMembersForMembers.filter((m) => m.role === 'MANAGER')

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
  const mockProjectFn = vi.fn((): any => mockProject)

  const stubs = {
    DatasetItem: {
      template: '<div class="mock-ds-item"><slot></slot></div>',
      props: ['dataset'],
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
    ProjectMembersList: {
      template: '<div class="mock-prj-members-item"><slot></slot></div>',
    },
  }

  const defaultParams = {
    currentUser: () => ({ id: 'userid' }),
    project: mockProjectFn,
    projectByUrlSlug: mockProjectFn,
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
    await router.replace({ name: 'project', params: { projectIdOrSlug: mockProject.id } })
  })

  describe('datasets tab', () => {
    beforeEach(async () => {
      await router.replace({ query: { tab: 'datasets' } })
    })

    it('should match snapshot (non-member)', async () => {
      const maxVisibleDatasets = ref(3) // Create a ref for the reactive property

      const wrapper = mount(ViewProjectPage, {
        props: { showLoading: false },
        global: {
          plugins: [store, router],
          provide: {
            [DefaultApolloClient]: graphqlMocks,
          },
          stubs,
        },
      })
      wrapper.vm.maxVisibleDatasets = maxVisibleDatasets as any

      await flushPromises()
      await nextTick()

      expect(wrapper.html()).toMatchSnapshot()

      expect(wrapper.findAll('button').map((w) => w.text())).toEqual(expect.arrayContaining(['Request access']))
      expect(wrapper.findAll('[role="tab"]').map((w) => w.text())).toEqual(['Datasets (4)', 'Members (2)'])
      expect(wrapper.findAll('.dataset-list > *')).toHaveLength(maxVisibleDatasets.value)
    })
  })

  describe('members tab', () => {
    beforeEach(async () => {
      await router.replace({ query: { tab: 'members' } })
    })

    it('should match snapshot (non-member)', async () => {
      const wrapper = mount(ViewProjectPage, {
        props: { showLoading: false },
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
      const customValue = { ...mockProject, currentUserRole: 'INVITED' }
      const customParams = {
        project: () => customValue,
        projectByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewProjectPage, {
        props: { showLoading: false },
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
      const customValue = { ...mockProject, currentUserRole: 'MEMBER', members: mockMembersForMembers }
      const customParams = {
        project: () => customValue,
        projectByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewProjectPage, {
        props: { showLoading: false },
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
      const customValue = { ...mockProject, currentUserRole: 'MANAGER', members: mockMembersForManagers }
      const customParams = {
        project: () => customValue,
        projectByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewProjectPage, {
        props: { showLoading: false },
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
      const customValue = { ...mockProject, currentUserRole: 'MANAGER' }
      const customParams = {
        project: () => customValue,
        projectByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewProjectPage, {
        props: { showLoading: false },
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
      const customValue = { ...mockProject, currentUserRole: 'MANAGER', publicationStatus: 'UNDER_REVIEW' }
      const customParams = {
        project: () => customValue,
        projectByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewProjectPage, {
        props: { showLoading: false },
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
      const customValue = { ...mockProject, currentUserRole: 'MANAGER', publicationStatus: 'PUBLISHED' }
      const customParams = {
        project: () => customValue,
        projectByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewProjectPage, {
        props: { showLoading: false },
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

  it(
    'should correctly fetch data and update the route if the project has a ' + 'urlSlug but is accessed by ID',
    async () => {
      const urlSlug = 'project-url-slug'
      const mockProjectFn: any = vi.fn(() => ({ ...mockProject, urlSlug }))
      await router.replace({ name: 'project', params: { projectIdOrSlug: urlSlug } })

      const customParams = {
        project: mockProjectFn,
        projectByUrlSlug: mockProjectFn,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewProjectPage, {
        props: { showLoading: false },
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

      expect(router.currentRoute.value.params.projectIdOrSlug).toEqual(urlSlug)
      // Assert that the correct graphql calls were made. See the GraphQLFieldResolver type for details on the args here
      expect(mockProjectFn).toHaveBeenCalledTimes(2)
      expect(wrapper.vm.projectId).toEqual(mockProject.id)
      expect(wrapper.vm.projectIdOrSlug).toEqual(urlSlug)
    }
  )

  describe('publishing tab', () => {
    beforeEach(async () => {
      await router.replace({ query: { tab: 'publishing' } })
    })

    it('should match snapshot (unpublished)', async () => {
      const customValue = { ...mockProject, currentUserRole: 'MANAGER' }
      const customParams = {
        project: () => customValue,
        projectByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewProjectPage, {
        props: { showLoading: false },
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
      const customValue = { ...mockProject, currentUserRole: 'MANAGER', publicationStatus: 'UNDER_REVIEW' }
      const customParams = {
        project: () => customValue,
        projectByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewProjectPage, {
        props: { showLoading: false },
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
      const customValue = { ...mockProject, currentUserRole: 'MANAGER', publicationStatus: 'PUBLISHED' }
      const customParams = {
        project: () => customValue,
        projectByUrlSlug: () => customValue,
      }
      await mockGraphql({
        ...defaultParams,
        ...customParams,
      })

      const wrapper = mount(ViewProjectPage, {
        props: { showLoading: false },
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
