// Stands in for `src/api/graphqlClient` during the build-time prerender.
//
// The real client reads `window.location` and opens a websocket the moment it
// is imported, neither of which exists in Node. Aliased in by the SSR branch of
// vite.config.mts (see `resolve.alias`).
//
// Every operation resolves immediately with an empty result, so `useQuery`
// settles instead of hanging the build on a request that cannot be made.
// Data-driven parts of a page therefore render in their empty state, which is
// intended: the prerender exists to publish the static copy, not a snapshot of
// the database.

import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client/core'

export function createOfflineApolloClient() {
  return new ApolloClient({
    link: new ApolloLink(
      () =>
        new Observable((observer: any) => {
          observer.next({ data: {} })
          observer.complete()
        })
    ),
    cache: new InMemoryCache({ addTypename: false }),
    ssrMode: true,
    defaultOptions: {
      query: { errorPolicy: 'ignore', fetchPolicy: 'no-cache' },
      watchQuery: { errorPolicy: 'ignore', fetchPolicy: 'no-cache' },
    },
  })
}

const apolloClient = createOfflineApolloClient()

// Takes no parameter on purpose: callers pass a handler, and ignoring it here
// keeps the linter from flagging an unused one.
export function setMaintenanceMessageHandler() {
  /* no-op during prerender */
}

export const refreshLoginStatus = async () => {
  /* no-op during prerender */
}

export default apolloClient
