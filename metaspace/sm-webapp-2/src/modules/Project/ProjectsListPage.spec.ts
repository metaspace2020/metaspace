import { nextTick, ref} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import {initMockGraphqlClient} from "../../tests/utils/mockGraphqlClient";
import router from "../../router";
import {vi} from "vitest";
import { DefaultApolloClient, useQuery } from "@vue/apollo-composable";
import ProjectsListPage from "./ProjectsListPage.vue";
import { MyProjectsListQuery, ProjectsListProject, ProjectsListQuery } from '../../api/project'
import {createStore} from "vuex";
import store from "../../store";
import actions from "../../store/actions";

let auxStore : any;
vi.mock('@vue/apollo-composable', () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  DefaultApolloClient: vi.fn(),
}));



describe('ProjectDatasetsDialog', () => {
  // These datetime strings are intentionally missing the `Z` at the end.
  // This makes them local time and prevents the snapshots from changing depending on which timezone they're run in.
  const mockProject1: ProjectsListProject = {
    id: 'project 1',
    name: 'project one',
    urlSlug: 'proj-one',
    isPublic: false,
    currentUserRole: 'MANAGER',
    numMembers: 1,
    numDatasets: 0,
    createdDT: '2018-08-29T05:00:00.000',
    latestUploadDT: null,
    members: [{ user: { name: 'TestUser1' }, role: 'MANAGER' }, { user: { name: 'TestUser2' }, role: 'MEMBER' }],
    publicationStatus: 'UNPUBLISHED',
    publishedDT: null,
  }
  const mockProject2: ProjectsListProject = {
    id: 'project 2',
    name: 'project two',
    urlSlug: null,
    isPublic: true,
    currentUserRole: null,
    numMembers: 20,
    numDatasets: 20,
    createdDT: '2018-01-01T07:00:00.000',
    latestUploadDT: '2018-08-01T09:00:00.000',
    members: [{ user: { name: 'TestUser1' }, role: 'MANAGER' }, { user: { name: 'TestUser2' }, role: 'MEMBER' }],
    publicationStatus: 'UNPUBLISHED',
    publishedDT: null,
  }
  const mockProject3: ProjectsListProject = {
    id: 'project 3',
    name: 'project three',
    urlSlug: null,
    isPublic: true,
    currentUserRole: 'MEMBER',
    numMembers: 10,
    numDatasets: 5,
    createdDT: '2018-04-30T11:00:00.000',
    latestUploadDT: '2018-05-15T13:00:00.000',
    members: [{ user: { name: 'TestUser1' }, role: 'MANAGER' }, { user: { name: 'TestUser2' }, role: 'MEMBER' }],
    publicationStatus: 'UNPUBLISHED',
    publishedDT: null,
  }

  const makeMockMyProjects = (projects: any[]): MyProjectsListQuery['myProjects'] => ({
    id: 'id',
    projects: projects.map(project => ({ project })),
  })
  const mockAllProjects: ProjectsListQuery['allProjects'] = [mockProject1, mockProject2]

  beforeEach(() => {
    router.push('/projects')
    auxStore = createStore({
      state: {
        ...store.state,
        simpleFilter: 'all-projects',
        simpleQuery: ''
      },
      getters: {
        filter:  (state) => ({
          simpleFilter:  state.simpleFilter,
          simpleQuery:  state.simpleQuery
        })
      },
      actions: actions,
      mutations: {
        setFilterListsLoading: vi.fn(),
        setFilterLists: vi.fn(),
        updateFilter: (state, filter) => {
          state.simpleFilter = filter.simpleFilter
          state.simpleQuery = filter.simpleQuery
        }
      }
    });

  })

  const mockGraphql = async (params) => {
    return initMockGraphqlClient({
      Query: () => (params),
    });
  };

  it('it should match snapshot', async() => {
    const queryReturn = {
      allProjects:  () => mockAllProjects,
      countProjects: () => 3,
    }
    const graphqlClient = await mockGraphql(queryReturn);
    (useQuery as any).mockReturnValue({
      result: ref({allProjects: queryReturn.allProjects(), countProjects: queryReturn.countProjects()}),
      loading: ref(false),
      onResult: vi.fn(),
    });

    const wrapper = mount(ProjectsListPage, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlClient
        }
      }
    });
    await flushPromises()
    await nextTick()

    const projectIds = wrapper.findAllComponents({ name: 'ProjectsListItem' })
      .map((projectListItem) => projectListItem.props().project.id);

    expect(wrapper.html()).toMatchSnapshot()
    expect(projectIds).toEqual(['project 1', 'project 2'])
  })

  it('should show only my projects when on the My Projects tab', async() => {
    const queryReturn = {
      allDatasets: () => [],
      allProjects: () => mockAllProjects,
      currentUser: () => makeMockMyProjects([mockProject3, mockProject1]),
    }
    const graphqlClient = await mockGraphql(queryReturn);
    (useQuery as any).mockReturnValue({
      result: ref({
        allDatasets: queryReturn.allDatasets(),
        allProjects: queryReturn.allProjects(),
        currentUser: queryReturn.currentUser()
      }),
      loading: ref(false),
      onResult: vi.fn(),
    });

    const wrapper = mount(ProjectsListPage, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlClient
        }
      }
    });
    await auxStore.commit('updateFilter', { simpleFilter: 'my-projects' })

    await flushPromises()
    await nextTick()

    const projectIds = wrapper.findAllComponents({ name: 'ProjectsListItem' })
      .map((projectListItem) => projectListItem.props().project.id);

    expect(wrapper.html()).toMatchSnapshot()
    expect(projectIds).toEqual(['project 1', 'project 2'])
  })

  it('should filter projects by the keyword search on the My Projects tab', async() => {
    const mockProjects = 'AB'
      .split('')
      .map(letter => ({
        id: `ID ${letter}`,
        name: `Project ${letter}${letter}${letter}`,
        date : '2018-08-29T05:00:00.000',
        publishedDT : '2018-08-29T05:00:00.000',
        latestUploadDT : '2018-08-29T05:00:00.000',
      }))
    const queryReturn = {
      currentUser: () => ({ id: 'userid' }),
      myProjects: () => makeMockMyProjects(mockProjects),
    }
    const graphqlClient = await mockGraphql(queryReturn);
    (useQuery as any).mockReturnValue({
      result: ref({
        myProjects: queryReturn.myProjects(),
        currentUser: queryReturn.currentUser()
      }),
      loading: ref(false),
      onResult: vi.fn(),
    });


    const wrapper = mount(ProjectsListPage, {
      global: {
        plugins: [auxStore, router],
        provide: {
          [DefaultApolloClient]: graphqlClient
        }
      }
    });

    await flushPromises()
    await nextTick()

    await auxStore.commit('updateFilter', { simpleFilter: 'my-projects', simpleQuery: 'AA' })
    await nextTick()

    const projectIds = wrapper.findAllComponents({ name: 'ProjectsListItem' })
      .map((projectListItem) => projectListItem.props().project.id);

    expect(wrapper.html()).toMatchSnapshot()
    expect(projectIds).toEqual(['ID A'])
  })

  it('should change actions for projects under review', async() => {
    const queryReturn = {
      allProjects:  () => [
        { ...mockProject1, publicationStatus: 'UNDER_REVIEW' },
        { ...mockProject2, publicationStatus: 'UNDER_REVIEW' },
      ],
    }
    const graphqlClient = await mockGraphql(queryReturn);
    (useQuery as any).mockReturnValue({
      result: ref({allProjects: queryReturn.allProjects()}),
      loading: ref(false),
      onResult: vi.fn(),
    });

    const wrapper = mount(ProjectsListPage, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlClient
        }
      }
    });
    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('should change actions for published projects', async() => {
    const queryReturn = {
      allProjects:  () => [
        { ...mockProject1, publicationStatus: 'PUBLISHED' },
        { ...mockProject2, publicationStatus: 'PUBLISHED' },
      ],
    }
    const graphqlClient = await mockGraphql(queryReturn);
    (useQuery as any).mockReturnValue({
      result: ref({allProjects: queryReturn.allProjects()}),
      loading: ref(false),
      onResult: vi.fn(),
    });

    const wrapper = mount(ProjectsListPage, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlClient
        }
      }
    });
    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })

})
