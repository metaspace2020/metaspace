import { mount, Stubs } from '@vue/test-utils';
import VueRouter from 'vue-router';
import ElementUI from 'element-ui';
import Vue from 'vue';
import ViewGroupProfile from './ViewGroupProfile.vue';
import router from '../../router';
import Vuex from 'vuex';
import account from '../Account/store/account';

Vue.use(ElementUI);
Vue.use(VueRouter);
Vue.use(Vuex);


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

  const store = new Vuex.Store({
    state: {
      filterLists: {
      },
    },
  });

  const stubs: Stubs = {
    DatasetItem: true
  };

  it('should match snapshot (non-member)', () => {
    const wrapper = mount(ViewGroupProfile, { router, store, stubs });
    wrapper.setData({
      loaded: true,
      data: mockData,
      maxVisibleDatasets: 2
    });
    expect(wrapper).toMatchSnapshot();
  });

  it('should match snapshot (invited)', () => {
    const wrapper = mount<Vue>(ViewGroupProfile, { router, store, stubs });
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
