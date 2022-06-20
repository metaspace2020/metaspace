import apolloClient from '../api/graphqlClient';
import {computed} from "@vue/composition-api";
import store from "../store/index";
export default {

  async initFilterLists(context) {
    if(context.state.filterListsLoading || context.state.filterLists != null)
      return;

    context.commit('setFilterListsLoading');

    const response = await apolloClient.query({
      fetchPolicy: 'cache-first',
    });

    // set annotationIds default according to values passed from snapshot to the store state
    context.commit('setFilterLists', {...response.data,
      annotationIds: computed(() => store.state.snapshotAnnotationIds)} );

  },

};
