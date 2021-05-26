import apolloClient from '../api/graphqlClient';
import {fetchOptionListsQuery} from '../api/metadata';
import {decodeParams} from '../modules/Filters';
import {computed} from "@vue/composition-api";
import store from "../store/index";
export default {

  async initFilterLists(context) {
    if(context.state.filterListsLoading || context.state.filterLists != null)
      return;

    context.commit('setFilterListsLoading');

    const response = await apolloClient.query({
      query: fetchOptionListsQuery,
      fetchPolicy: 'cache-first',
    });

    // set annotationIds default according to values passed from snapshot to the store state
    context.commit('setFilterLists', {...response.data,
      annotationIds: computed(() => store.state.snapshotAnnotationIds)} );

    // Refresh the current filter so that computed defaults that depend on `filterLists` are applied
    const filter = decodeParams(context.state.route, context.state.filterLists)
    context.commit('updateFilter', filter)
  },

};
