import { createStore } from 'vuex'
import mutations from './mutations';
import getters from './getters';
import actions from './actions.js';

import {accountModule} from '../modules/Account';



const store = createStore({
  state: {
    // names of currently shown filters
    orderedActiveFilters: [],

    reportError: false,

    filterLists: null,
    filterListsLoading: false,

    // currently selected annotation
    annotation: undefined,

    // currently selected normalization matrix
    normalization: undefined,

    // roi settings
    roiInfo: {visible: false},

    // is annotation table loading?
    tableIsLoading: true,

    lastUsedFilters: {},

    currentTour: null,

    currentUser: {},

    // ion image global viewer settings
    channels: [],
    mode: 'SINGLE',
    route: {
      path: '',
      params: {},
      query: {},
    },
  },

  getters,
  mutations,
  actions,
  modules: {
    account: accountModule
  }
})

export default store;
