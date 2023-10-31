export default {
  filter() {
    return {}
    // return decodeParams(state.route, state.filterLists);
  },

  currentUser(state) {
    return state.currentUser;
  },
}
