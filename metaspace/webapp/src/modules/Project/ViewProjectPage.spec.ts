import { mount, Stubs } from '@vue/test-utils';
import Vue from 'vue';
import ViewProjectPage from './ViewProjectPage.vue';
import router from '../../router';
import { initMockGraphqlClient, provide } from '../../../tests/utils/mockGraphqlClient';



describe('ViewProjectPage', () => {

  const mockProject = {
    id: '00000000-1111-2222-3333-444444444444',
    name: 'project name',
    shortName: 'projectShortName',
    urlSlug: null,
    currentUserRole: null,
  };
  const mockProjectFn = jest.fn(() => mockProject);
  const graphqlMocks = {
    Query: () => ({
      currentUser: () => ({ id: 'userid' }),
      project: mockProjectFn,
      projectByUrlSlug: mockProjectFn,
      allDatasets: () => ([
        { id: 'datasetId1', name: 'dataset name 1' },
        { id: 'datasetId2', name: 'dataset name 2' },
        { id: 'datasetId3', name: 'dataset name 3' },
        { id: 'datasetId4', name: 'dataset name 4' },
      ]),
      countDatasets: () => 4,
    })
  };
  
  const stubs: Stubs = {
    DatasetItem: true
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
    router.replace({ name: 'project', params: { projectIdOrSlug: mockProject.id } });
  });

  it('should match snapshot (non-member)', async () => {
    initMockGraphqlClient(graphqlMocks);
    const wrapper = mount(ViewProjectPage, { router, stubs, provide, sync: false });
    wrapper.setData({ maxVisibleDatasets: 3 }); // Also test that the datasets list is correctly clipped
    await Vue.nextTick();

    expect(wrapper).toMatchSnapshot();
  });

  it('should match snapshot (invited)', async () => {
    mockProjectFn.mockImplementation(() => ({...mockProject, currentUserRole: 'INVITED'}));
    initMockGraphqlClient(graphqlMocks);
    const wrapper = mount(ViewProjectPage, { router, stubs, provide, sync: false });
    await Vue.nextTick();

    expect(wrapper).toMatchSnapshot();
  });

  it('should correctly fetch data and update the route if the project has a urlSlug but is accessed by ID', async () => {
    const urlSlug = 'project-url-slug';
    mockProjectFn.mockImplementation(() => ({...mockProject, urlSlug}));
    initMockGraphqlClient(graphqlMocks);

    const wrapper = mount(ViewProjectPage, { router, stubs, provide, sync: false });
    await Vue.nextTick();

    expect(router.currentRoute.params.projectIdOrSlug).toEqual(urlSlug);
    // Assert that the correct graphql calls were made. See the GraphQLFieldResolver type for details on the args here
    expect(mockProjectFn.mock.calls[0][1].projectId).toEqual(mockProject.id);
    expect(mockProjectFn.mock.calls[0][3].fieldName).toEqual('project');
    expect(mockProjectFn.mock.calls[1][1].urlSlug).toEqual(urlSlug);
    expect(mockProjectFn.mock.calls[1][3].fieldName).toEqual('projectByUrlSlug');
  });
});
