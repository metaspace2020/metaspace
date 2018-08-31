import { mount, Stubs } from '@vue/test-utils';
import Vue from 'vue';
import ViewGroupProfile from './ViewGroupProfile.vue';
import router from '../../router';


describe('ViewGroupProfile', () => {

  const mockData = {
    currentUser: { id: 'userid' },
    group: {
      id: 'groupId',
      name: 'group name',
      shortName: 'groupShortName',
      currentUserRole: null,
    },
    allDatasets: [
      { id: 'datasetId1', name: 'dataset name 1' },
      { id: 'datasetId2', name: 'dataset name 2' },
      { id: 'datasetId3', name: 'dataset name 3' },
    ],
    countDatasets: 3
  };

  const stubs: Stubs = {
    DatasetItem: true
  };

  router.replace({ name: 'group', params: { groupId: mockData.group.id } });

  it('should match snapshot (non-member)', () => {
    const wrapper = mount(ViewGroupProfile, { router, stubs });
    wrapper.setData({
      loaded: true,
      data: mockData,
      maxVisibleDatasets: 2
    });
    expect(wrapper).toMatchSnapshot();
  });

  it('should match snapshot (invited)', () => {
    const wrapper = mount<Vue>(ViewGroupProfile, { router, stubs });
    wrapper.setData({
      loaded: true,
      data: {
        ...mockData,
        group: {
          ...mockData.group,
          currentUserRole: 'INVITED'
        }
      },
      maxVisibleDatasets: 2
    });
    expect(wrapper).toMatchSnapshot();
  });
});
