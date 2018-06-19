import apolloClient from '../graphqlClient';
import {fetchOptionListsQuery} from '../api/metadata';
import {decodeParams} from '../url';

export default {

  async initFilterLists(context) {
    if(context.state.filterListsLoading || context.state.filterLists != null)
      return;

    context.commit('setFilterListsLoading');

    const response = await apolloClient.query({
      query: fetchOptionListsQuery
    });

    context.commit('setFilterLists', response.data);
    // Refresh the current filter so that computed defaults that depend on `filterLists` are applied
    const filter = decodeParams(context.state.route, context.state.filterLists)
    context.commit('updateFilter', filter)
  },

};
