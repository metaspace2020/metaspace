import { mount } from '@vue/test-utils';
import Vue from 'vue';
import ProjectsListPage from './ProjectsListPage.vue';
import router from '../../router';
import { MyProjectsListQuery, ProjectsListProject, ProjectsListQuery } from '../../api/project';
import { initMockGraphqlClient, provide } from '../../../tests/utils/mockGraphqlClient';
import Vuex from 'vuex';
import store from '../../store';
import { sync } from 'vuex-router-sync';


Vue.use(Vuex);

describe('ProjectsListPage', () => {

  // These datetime strings are intentionally missing the `Z` at the end.
  // This makes them local time and prevents the snapshots from changing depending on which timezone they're run in.
  const mockProject1: ProjectsListProject = { id: 'project 1', name: 'project one', urlSlug: 'proj-one', isPublic: false, currentUserRole: 'MANAGER',
    numMembers: 1, numDatasets: 0, createdDT: '2018-08-29T05:00:00.000', latestUploadDT: null };
  const mockProject2: ProjectsListProject = { id: 'project 2', name: 'project two', urlSlug: null, isPublic: true, currentUserRole: null,
    numMembers: 20, numDatasets: 20, createdDT: '2018-01-01T07:00:00.000', latestUploadDT: '2018-08-01T09:00:00.000' };
  const mockProject3: ProjectsListProject = { id: 'project 3', name: 'project three', urlSlug: null, isPublic: true, currentUserRole: 'MEMBER',
    numMembers: 10, numDatasets: 5, createdDT: '2018-04-30T11:00:00.000', latestUploadDT: '2018-05-15T13:00:00.000' };

  const mockMyProjects: MyProjectsListQuery['myProjects'] = {
    id: 'id',
    projects: [{project: mockProject1}, {project:mockProject3}],
  };
  const mockAllProjects: ProjectsListQuery['allProjects'] = [mockProject1, mockProject2];

  sync(store, router);

  it('should match snapshot', async () => {
    initMockGraphqlClient({
      Query: () => ({
        currentUser: () => mockMyProjects,
        allProjects: () => mockAllProjects,
        countProjects: () => 3,
      })
    });
    const wrapper = mount(ProjectsListPage, { router, provide, store, sync: false });
    await Vue.nextTick();

    expect(wrapper).toMatchSnapshot();
    const projectIds = wrapper.findAll({name:'ProjectsListItem'}).wrappers.map(item => item.props().project.id);
    expect(projectIds).toEqual(['project 1', 'project 3', 'project 2']);
  });
});
