// src/stores/routeStore.js
import { defineStore } from 'pinia';

export const useRouteStore = defineStore({
  id: 'route',
  state: () => ({
    fullPath: '',
    path: '',
    hash: '',
    query: {},
    params: {},
    // ... any other route properties you want to track
  }),
  actions: {
    updateRoute(route) {
      this.fullPath = route.fullPath;
      this.path = route.path;
      this.hash = route.hash;
      this.query = route.query;
      this.params = route.params;
    }
  }
});
