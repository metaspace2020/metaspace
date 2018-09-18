import { mount, Stubs } from '@vue/test-utils';
import Vue from 'vue';
import ViewGroupProfile from './ViewGroupProfile.vue';
import router from '../../router';
import { initMockGraphqlClient, provide } from '../../../tests/utils/mockGraphqlClient';


describe('ViewGroupProfile', () => {

  const mockGroup = {
    id: '00000000-1111-2222-3333-444444444444',
    name: 'group name',
    shortName: 'groupShortName',
    urlSlug: null,
    currentUserRole: null,
  };
  const mockGroupFn = jest.fn(() => mockGroup);
  const graphqlMocks = {
    Query: () => ({
      currentUser: () => ({ id: 'userid' }),
      group: mockGroupFn,
      groupByUrlSlug: mockGroupFn,
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
    router.replace({ name: 'group', params: { groupIdOrSlug: mockGroup.id } });
  });

  it('should match snapshot (non-member)', async () => {
    initMockGraphqlClient(graphqlMocks);
    const wrapper = mount(ViewGroupProfile, { router, stubs, provide, sync: false });
    wrapper.setData({ maxVisibleDatasets: 3 }); // Also test that the datasets list is correctly clipped
    await Vue.nextTick();

    expect(wrapper).toMatchSnapshot();
  });

  it('should match snapshot (invited)', async () => {
    mockGroupFn.mockImplementation(() => ({...mockGroup, currentUserRole: 'INVITED'}));
    initMockGraphqlClient(graphqlMocks);

    const wrapper = mount(ViewGroupProfile, { router, stubs, provide, sync: false });
    await Vue.nextTick();

    expect(wrapper).toMatchSnapshot();
  });

  it('should correctly fetch data and update the route if the group has a urlSlug but is accessed by ID', async () => {
    const urlSlug = 'group-url-slug';
    mockGroupFn.mockImplementation(() => ({...mockGroup, urlSlug}));
    initMockGraphqlClient(graphqlMocks);

    const wrapper = mount(ViewGroupProfile, { router, stubs, provide, sync: false });
    await Vue.nextTick();

    expect(router.currentRoute.params.groupIdOrSlug).toEqual(urlSlug);
    // Assert that the correct graphql calls were made. See the GraphQLFieldResolver type for details on the args here
    expect(mockGroupFn.mock.calls[0][1].groupId).toEqual(mockGroup.id);
    expect(mockGroupFn.mock.calls[0][3].fieldName).toEqual('group');
    expect(mockGroupFn.mock.calls[1][1].urlSlug).toEqual(urlSlug);
    expect(mockGroupFn.mock.calls[1][3].fieldName).toEqual('groupByUrlSlug');
  });
});
