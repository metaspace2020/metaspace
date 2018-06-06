import apolloClient from '../graphqlClient';
import {fetchOptionListsQuery} from '../api/metadata';
import {decodeParams} from '../url';
import { decodePayload } from '../util';
import tokenAutorefresh from '../tokenAutorefresh';

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

  async loadUser(context) {
    const jwt = await tokenAutorefresh.getJwt();
    const {name, email, role} = decodePayload(jwt);

    context.commit('setUser', {name, email, role});
  },

  async logout(context) {
    await fetch('/logout', {credentials: 'include'});
    await tokenAutorefresh.refreshJwt(true);
    await context.dispatch('loadUser');
  },
};
