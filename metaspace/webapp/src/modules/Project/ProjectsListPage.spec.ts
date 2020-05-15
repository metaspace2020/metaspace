import { mount, Wrapper } from '@vue/test-utils'
import Vue from 'vue'
import ProjectsListPage from './ProjectsListPage.vue'
import router from '../../router'
import { MyProjectsListQuery, ProjectsListProject, ProjectsListQuery } from '../../api/project'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'
import Vuex from 'vuex'
import store from '../../store'
import { sync } from 'vuex-router-sync'

Vue.use(Vuex)

describe('ProjectsListPage', () => {
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

  sync(store, router)

  beforeEach(() => {
    router.push('/projects')
  })

  it('should match snapshot', async() => {
    initMockGraphqlClient({
      Query: () => ({
        allProjects: () => mockAllProjects,
        countProjects: () => 3,
      }),
    })
    const wrapper = mount(ProjectsListPage, { router, apolloProvider, store })
    await Vue.nextTick()
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
    const projectIds = wrapper.findAllComponents({ name: 'ProjectsListItem' })
      .wrappers
      .map(item => item.props().project.id)
    expect(projectIds).toEqual(['project 1', 'project 2'])
  })

  it('should show only my projects when on the My Projects tab', async() => {
    initMockGraphqlClient({
      Query: () => ({
        currentUser: () => makeMockMyProjects([mockProject3, mockProject1]),
        allProjects: () => mockAllProjects,
      }),
    })

    const wrapper = mount(ProjectsListPage, { router, apolloProvider, store })
    store.commit('updateFilter', { simpleFilter: 'my-projects' })
    await Vue.nextTick()

    const projectIds = wrapper.findAllComponents({ name: 'ProjectsListItem' })
      .wrappers
      .map(item => item.props().project.id)
    expect(projectIds).toEqual(['project 3', 'project 1'])
  })

  it('should filter projects by the keyword search on the My Projects tab', async() => {
    const mockProjects = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      .split('')
      .map(letter => ({ id: `ID ${letter}`, name: `Project ${letter}${letter}${letter}` }))
    initMockGraphqlClient({
      Query: () => ({
        currentUser: () => makeMockMyProjects(mockProjects),
      }),
    })

    const wrapper = mount(ProjectsListPage, { router, apolloProvider, store })
    store.commit('updateFilter', { simpleFilter: 'my-projects', simpleQuery: 'ww' })
    await Vue.nextTick()

    const projectIds = wrapper.findAllComponents({ name: 'ProjectsListItem' })
      .wrappers
      .map(item => item.props().project.id)
    expect(projectIds).toEqual(['ID W'])
  })

  it('should change actions for projects under review', async() => {
    initMockGraphqlClient({
      Query: () => ({
        allProjects: () => [
          { ...mockProject1, publicationStatus: 'UNDER_REVIEW' },
          { ...mockProject2, publicationStatus: 'UNDER_REVIEW' },
        ],
      }),
    })
    const wrapper = mount(ProjectsListPage, { router, apolloProvider, store })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should change actions for published projects', async() => {
    initMockGraphqlClient({
      Query: () => ({
        allProjects: () => [
          { ...mockProject1, publicationStatus: 'PUBLISHED' },
          { ...mockProject2, publicationStatus: 'PUBLISHED' },
        ],
      }),
    })
    const wrapper = mount(ProjectsListPage, { router, apolloProvider, store })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })
})
