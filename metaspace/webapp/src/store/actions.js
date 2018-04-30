import apolloClient from '../graphqlClient';
import {fetchOptionListsQuery} from '../api/metadata';

export default {

  async initFilterLists(context) {
    if(context.state.filterListsLoading || context.state.filterLists != null)
      return;

    context.commit('setFilterListsLoading');

    const response = await apolloClient.query({
      query: fetchOptionListsQuery
    });

    context.commit('setFilterLists', response.data);
  }
};
