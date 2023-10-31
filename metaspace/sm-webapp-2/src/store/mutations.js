import { without} from "lodash-es";



export default {
  updateCurrentUser(state, user) {
    state.currentUser = user
  },

  updateFilterOnNavigate(state) {
    const newActiveFilters = [] // Object.keys(decodeParams(to, state.filterLists));

    const removed = without(state.orderedActiveFilters, ...newActiveFilters);
    const added = without(newActiveFilters, ...state.orderedActiveFilters);

    state.orderedActiveFilters = without(state.orderedActiveFilters, ...removed);
    state.orderedActiveFilters.push(...added);
    // sortFilterKeys(state.orderedActiveFilters);
  },

};
